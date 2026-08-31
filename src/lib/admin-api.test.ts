import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { defaultSiteContent } from "../../shared/default-site-content.ts";
import {
  AdminApiError,
  getCurrentAdmin,
  isAdminHostedHere,
  loadAdminStats,
  loadRevisions,
  loginAdmin,
  logoutAdmin,
  recoverAdmin,
  resolveAdminSiteUrl,
  restoreRevision,
  saveContent,
  setupAdmin
} from "./admin-api.ts";

const netlifyLocation = new URL("https://yyq-web.netlify.app/admin");
const pagesLocation = new URL("https://mrxiaoxies.github.io/YYQ-Personal-web/#admin");
const user = { email: "admin@example.com", id: "admin-1", role: "admin" as const };
const canonicalIso = "2026-08-31T00:00:00.000Z";
const canonicalRevisionId = `${canonicalIso}-12345678-1234-4123-8123-123456789abc`;

type RecordedRequest = {
  init: RequestInit | undefined;
  url: string;
};

function createFetch(response: Response) {
  const requests: RecordedRequest[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ init, url: String(input) });
    return response.clone();
  };
  return { fetchImpl, requests };
}

function options(fetchImpl: typeof fetch, location = netlifyLocation, configuredUrl = "") {
  return { configuredUrl, fetch: fetchImpl, location };
}

function validDocument() {
  return {
    ...structuredClone(defaultSiteContent),
    updatedAt: canonicalIso,
    version: "content-current"
  };
}

function validStats() {
  return {
    generatedAt: canonicalIso,
    lastVisitAt: null,
    onlineCount: 1,
    onlineWindowSeconds: 90,
    recentVisitors: [
      {
        city: "Shanghai",
        country: "China",
        lastSeenAt: canonicalIso,
        page: "/",
        pageViews: 2,
        referrer: "direct",
        sessionId: "session1",
        userAgent: "test-agent"
      }
    ],
    todayVisits: 3,
    totalVisitors: 4,
    totalVisits: 5
  };
}

function validRevision(sourceVersion = "builtin-v1") {
  return {
    actorEmail: user.email,
    createdAt: canonicalIso,
    id: canonicalRevisionId,
    reason: "save" as const,
    sourceVersion
  };
}

async function rejectsInvalidResponse(promise: Promise<unknown>, leakedText?: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.code, "invalid_response");
    assert.equal(error.message, "The administrator API returned an invalid response.");
    if (leakedText) assert.doesNotMatch(error.message, new RegExp(leakedText, "i"));
    return true;
  });
}

test("resolves Pages to Netlify, other hosts to same-origin, and normalizes an explicit site", () => {
  assert.equal(resolveAdminSiteUrl(pagesLocation), "https://yyq-web.netlify.app");
  assert.equal(resolveAdminSiteUrl(netlifyLocation), "");
  assert.equal(resolveAdminSiteUrl(new URL("http://127.0.0.1:5173/")), "");
  assert.equal(
    resolveAdminSiteUrl(pagesLocation, " https://admin.example.com#admin "),
    "https://admin.example.com/#admin"
  );
  assert.equal(resolveAdminSiteUrl(pagesLocation, "https://admin.example.com/"), "https://admin.example.com");
});

test("detects whether the current origin can host the administrator session", () => {
  assert.equal(isAdminHostedHere(pagesLocation), false);
  assert.equal(isAdminHostedHere(netlifyLocation), true);
  assert.equal(isAdminHostedHere(netlifyLocation, "https://yyq-web.netlify.app/"), true);
  assert.equal(isAdminHostedHere(netlifyLocation, "https://admin.example.com"), false);
});

test("configured administrator links keep #admin while API requests use only the canonical origin", async () => {
  const { fetchImpl, requests } = createFetch(Response.json({ user }));
  const configuredUrl = "https://yyq-web.netlify.app/#admin";

  assert.equal(resolveAdminSiteUrl(pagesLocation, configuredUrl), configuredUrl);
  assert.equal(isAdminHostedHere(netlifyLocation, configuredUrl), true);
  assert.deepEqual(await getCurrentAdmin(options(fetchImpl, pagesLocation, configuredUrl)), user);
  assert.equal(requests[0].url, "https://yyq-web.netlify.app/api/admin/auth?action=me");
});

test("malicious and malformed administrator site configuration fails closed before fetch", async () => {
  const invalidConfigurations = [
    "ftp://yyq-web.netlify.app",
    "javascript:alert(1)",
    "https://admin:secret@yyq-web.netlify.app",
    "https://yyq-web.netlify.app?mode=admin",
    "https://yyq-web.netlify.app/admin",
    "https://yyq-web.netlify.app/#other",
    "https://yyq-web.netlify.app///",
    "not a url"
  ];

  for (const configuredUrl of invalidConfigurations) {
    assert.throws(
      () => resolveAdminSiteUrl(pagesLocation, configuredUrl),
      (error: unknown) => error instanceof AdminApiError && error.code === "invalid_configuration",
      configuredUrl
    );
    assert.equal(isAdminHostedHere(pagesLocation, configuredUrl), false, configuredUrl);

    let fetchCalls = 0;
    const fetchImpl = async () => {
      fetchCalls += 1;
      return Response.json({ user });
    };
    await assert.rejects(
      getCurrentAdmin(options(fetchImpl, pagesLocation, configuredUrl)),
      (error: unknown) => error instanceof AdminApiError && error.code === "invalid_configuration",
      configuredUrl
    );
    assert.equal(fetchCalls, 0, configuredUrl);
  }
});

test("getCurrentAdmin uses the me endpoint and credentialed JSON request", async () => {
  const { fetchImpl, requests } = createFetch(Response.json({ user }));
  assert.deepEqual(await getCurrentAdmin(options(fetchImpl)), user);
  assert.deepEqual(requests, [{
    init: { credentials: "include", headers: { Accept: "application/json" }, method: "GET" },
    url: "/api/admin/auth?action=me"
  }]);
});

test("login sends only the strict credential payload", async () => {
  const { fetchImpl, requests } = createFetch(Response.json({ user }));
  assert.deepEqual(await loginAdmin({ email: user.email, password: "secret" }, options(fetchImpl)), user);
  assert.equal(requests[0].url, "/api/admin/auth?action=login");
  assert.deepEqual(requests[0].init, {
    body: JSON.stringify({ email: user.email, password: "secret" }),
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST"
  });
});

test("setup and recover send exact JSON and recover maps password to newPassword", async () => {
  const setupFetch = createFetch(Response.json({ user }));
  await setupAdmin(
    { email: user.email, password: "secret", setupToken: "one-time-setup" },
    options(setupFetch.fetchImpl)
  );
  assert.deepEqual(JSON.parse(String(setupFetch.requests[0].init?.body)), {
    email: user.email,
    password: "secret",
    setupToken: "one-time-setup"
  });
  assert.equal(setupFetch.requests[0].url, "/api/admin/auth?action=setup");

  const recoverFetch = createFetch(Response.json({ user }));
  await recoverAdmin(
    { email: user.email, password: "new-secret", recoveryToken: "one-time-recovery" },
    options(recoverFetch.fetchImpl)
  );
  assert.deepEqual(JSON.parse(String(recoverFetch.requests[0].init?.body)), {
    email: user.email,
    newPassword: "new-secret",
    recoveryToken: "one-time-recovery"
  });
  assert.equal(recoverFetch.requests[0].url, "/api/admin/auth?action=recover");
});

test("logout sends an empty JSON object with credentials included", async () => {
  const { fetchImpl, requests } = createFetch(Response.json({ ok: true }));
  await logoutAdmin(options(fetchImpl));
  assert.equal(requests[0].url, "/api/admin/auth?action=logout");
  assert.equal(requests[0].init?.credentials, "include");
  assert.equal(requests[0].init?.body, "{}");
  assert.equal(new Headers(requests[0].init?.headers).get("Content-Type"), "application/json");
});

test("loads and strictly parses administrator analytics", async () => {
  const stats = validStats();
  const { fetchImpl, requests } = createFetch(Response.json(stats));
  assert.deepEqual(await loadAdminStats(options(fetchImpl)), stats);
  assert.equal(requests[0].url, "/api/stats");
  assert.equal(requests[0].init?.credentials, "include");

  const invalid = createFetch(Response.json({ ...stats, unexpected: true }));
  await assert.rejects(loadAdminStats(options(invalid.fetchImpl)), (error: unknown) =>
    error instanceof AdminApiError && error.code === "invalid_response"
  );
});

test("analytics timestamps must be canonical ISO values", async () => {
  const cases = [
    ["generatedAt without milliseconds", (stats: ReturnType<typeof validStats>) => {
      stats.generatedAt = "2026-08-31T00:00:00Z";
    }],
    ["invalid lastVisitAt", (stats: ReturnType<typeof validStats>) => {
      stats.lastVisitAt = "not-a-date";
    }],
    ["normalized lastSeenAt", (stats: ReturnType<typeof validStats>) => {
      stats.recentVisitors[0].lastSeenAt = "2026-08-31T08:00:00.000+08:00";
    }]
  ] as const;

  for (const [name, mutate] of cases) {
    const payload = validStats();
    mutate(payload);
    const { fetchImpl } = createFetch(Response.json(payload));
    await rejectsInvalidResponse(loadAdminStats(options(fetchImpl)), name);
  }
});

test("analytics counters require safe integers and a positive online window", async () => {
  const cases = [
    ["fractional online count", (stats: ReturnType<typeof validStats>) => { stats.onlineCount = 1.5; }],
    ["zero online window", (stats: ReturnType<typeof validStats>) => { stats.onlineWindowSeconds = 0; }],
    ["fractional online window", (stats: ReturnType<typeof validStats>) => {
      stats.onlineWindowSeconds = 1.5;
    }],
    ["negative today visits", (stats: ReturnType<typeof validStats>) => { stats.todayVisits = -1; }],
    ["unsafe total visitors", (stats: ReturnType<typeof validStats>) => {
      stats.totalVisitors = Number.MAX_SAFE_INTEGER + 1;
    }],
    ["fractional page views", (stats: ReturnType<typeof validStats>) => {
      stats.recentVisitors[0].pageViews = 1.25;
    }]
  ] as const;

  for (const [name, mutate] of cases) {
    const payload = validStats();
    mutate(payload);
    const { fetchImpl } = createFetch(Response.json(payload));
    await rejectsInvalidResponse(loadAdminStats(options(fetchImpl)), name);
  }

  for (const literal of ["NaN", "Infinity", "-Infinity"]) {
    const raw = JSON.stringify(validStats()).replace('"totalVisits":5', `"totalVisits":${literal}`);
    const { fetchImpl } = createFetch(new Response(raw, { headers: { "Content-Type": "application/json" } }));
    await rejectsInvalidResponse(loadAdminStats(options(fetchImpl)), literal);
  }
});

test("save sends an exact update including expectedVersion and validates the document", async () => {
  const document = validDocument();
  const update = { expectedVersion: "content-old", sections: structuredClone(defaultSiteContent.sections) };
  const { fetchImpl, requests } = createFetch(Response.json(document));
  assert.deepEqual(await saveContent(update, options(fetchImpl)), document);
  assert.equal(requests[0].url, "/api/admin/content");
  assert.equal(requests[0].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), update);
  assert.equal(requests[0].init?.credentials, "include");

  const invalid = createFetch(Response.json({ ...document, schemaVersion: 99 }));
  await assert.rejects(saveContent(update, options(invalid.fetchImpl)), (error: unknown) =>
    error instanceof AdminApiError && error.code === "invalid_response"
  );
});

test("site content updatedAt must be canonical ISO", async () => {
  const update = { expectedVersion: "content-old", sections: structuredClone(defaultSiteContent.sections) };
  for (const updatedAt of ["2026-08-31T00:00:00Z", "not-a-date", "2026-02-30T00:00:00.000Z"]) {
    const payload = { ...validDocument(), updatedAt };
    const { fetchImpl } = createFetch(Response.json(payload));
    await rejectsInvalidResponse(saveContent(update, options(fetchImpl)), updatedAt);
  }
});

test("loads strict revision summaries", async () => {
  const revisions = [validRevision()];
  const { fetchImpl, requests } = createFetch(Response.json(revisions));
  assert.deepEqual(await loadRevisions(options(fetchImpl)), revisions);
  assert.equal(requests[0].url, "/api/admin/revisions");
  assert.equal(requests[0].init?.credentials, "include");
});

test("revision timestamps, ids, email, and content source versions match the backend contract", async () => {
  const cases = [
    ["non-canonical createdAt", { ...validRevision(), createdAt: "2026-08-31T00:00:00Z" }],
    ["id timestamp mismatch", {
      ...validRevision(),
      id: "2026-08-30T00:00:00.000Z-12345678-1234-4123-8123-123456789abc"
    }],
    ["invalid UUID version", {
      ...validRevision(),
      id: `${canonicalIso}-12345678-1234-9123-8123-123456789abc`
    }],
    ["invalid UUID variant", {
      ...validRevision(),
      id: `${canonicalIso}-12345678-1234-4123-7123-123456789abc`
    }],
    ["uppercase actor email", { ...validRevision(), actorEmail: "Admin@example.com" }],
    ["malformed actor email", { ...validRevision(), actorEmail: "admin.example.com" }],
    ["empty source version", { ...validRevision(), sourceVersion: "" }],
    ["malformed content source", { ...validRevision(), sourceVersion: "content-old" }],
    ["normalized content timestamp", {
      ...validRevision(),
      sourceVersion: "content-2026-08-31T00:00:00Z-12345678-1234-4123-8123-123456789abc"
    }]
  ] as const;

  for (const [name, revision] of cases) {
    const { fetchImpl } = createFetch(Response.json([revision]));
    await rejectsInvalidResponse(loadRevisions(options(fetchImpl)), name);
  }
});

test("revision sourceVersion accepts canonical content versions and opaque builtin or legacy versions", async () => {
  const revisions = [
    validRevision("builtin-v1"),
    { ...validRevision("legacy-import"), reason: "restore" as const },
    validRevision(`content-${canonicalRevisionId}`)
  ];
  const { fetchImpl } = createFetch(Response.json(revisions));
  assert.deepEqual(await loadRevisions(options(fetchImpl)), revisions);
});

test("restore uses the exact action URL and exact input body", async () => {
  const document = validDocument();
  const input = {
    expectedVersion: "content-current",
    revisionId: "2026-08-31T00:00:00.000Z-12345678-1234-4123-8123-123456789abc"
  };
  const { fetchImpl, requests } = createFetch(Response.json(document));
  assert.deepEqual(await restoreRevision(input, options(fetchImpl)), document);
  assert.equal(requests[0].url, "/api/admin/content?action=restore");
  assert.equal(requests[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), input);
  assert.equal(requests[0].init?.credentials, "include");
});

test("normalized 401 and 409 failures become AdminApiError values", async () => {
  const unauthorized = createFetch(Response.json(
    { error: { code: "unauthorized", message: "Administrator authentication is required." } },
    { status: 401 }
  ));
  await assert.rejects(getCurrentAdmin(options(unauthorized.fetchImpl)), (error: unknown) =>
    error instanceof AdminApiError && error.code === "unauthorized" && error.status === 401
  );

  const conflict = createFetch(Response.json(
    { error: { code: "content_conflict", message: "Reload first." } },
    { status: 409 }
  ));
  await assert.rejects(
    saveContent({ expectedVersion: "old", sections: defaultSiteContent.sections }, options(conflict.fetchImpl)),
    (error: unknown) => error instanceof AdminApiError && error.code === "content_conflict" && error.status === 409
  );
});

test("malformed error responses use safe generic details without leaking raw text", async () => {
  const rawSecret = "database password is hunter2";
  const { fetchImpl } = createFetch(new Response(rawSecret, { status: 500 }));
  await assert.rejects(getCurrentAdmin(options(fetchImpl)), (error: unknown) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.code, "request_failed");
    assert.equal(error.status, 500);
    assert.doesNotMatch(error.message, /hunter2|database password/i);
    return true;
  });
});

test("success payloads reject extra fields and malformed JSON", async () => {
  const extraUser = createFetch(Response.json({ user: { ...user, token: "must-not-be-trusted" } }));
  await assert.rejects(getCurrentAdmin(options(extraUser.fetchImpl)), (error: unknown) =>
    error instanceof AdminApiError && error.code === "invalid_response"
  );

  const malformed = createFetch(new Response("{", { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(loadRevisions(options(malformed.fetchImpl)), (error: unknown) =>
    error instanceof AdminApiError && error.code === "invalid_response"
  );
});

test("the client source does not reference browser credential storage", async () => {
  const source = await readFile(new URL("./admin-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});
