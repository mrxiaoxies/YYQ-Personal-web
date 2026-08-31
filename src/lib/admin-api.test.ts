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
    updatedAt: "2026-08-31T00:00:00.000Z",
    version: "content-current"
  };
}

function validStats() {
  return {
    generatedAt: "2026-08-31T00:00:00.000Z",
    lastVisitAt: null,
    onlineCount: 1,
    onlineWindowSeconds: 90,
    recentVisitors: [
      {
        city: "Shanghai",
        country: "China",
        lastSeenAt: "2026-08-31T00:00:00.000Z",
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

test("resolves Pages to Netlify, other hosts to same-origin, and normalizes an explicit site", () => {
  assert.equal(resolveAdminSiteUrl(pagesLocation), "https://yyq-web.netlify.app");
  assert.equal(resolveAdminSiteUrl(netlifyLocation), "");
  assert.equal(resolveAdminSiteUrl(new URL("http://127.0.0.1:5173/")), "");
  assert.equal(resolveAdminSiteUrl(pagesLocation, " https://admin.example.com/// "), "https://admin.example.com");
});

test("detects whether the current origin can host the administrator session", () => {
  assert.equal(isAdminHostedHere(pagesLocation), false);
  assert.equal(isAdminHostedHere(netlifyLocation), true);
  assert.equal(isAdminHostedHere(netlifyLocation, "https://yyq-web.netlify.app/"), true);
  assert.equal(isAdminHostedHere(netlifyLocation, "https://admin.example.com"), false);
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

test("loads strict revision summaries", async () => {
  const revisions = [{
    actorEmail: user.email,
    createdAt: "2026-08-31T00:00:00.000Z",
    id: "2026-08-31T00:00:00.000Z-12345678-1234-4123-8123-123456789abc",
    reason: "save" as const,
    sourceVersion: "content-old"
  }];
  const { fetchImpl, requests } = createFetch(Response.json(revisions));
  assert.deepEqual(await loadRevisions(options(fetchImpl)), revisions);
  assert.equal(requests[0].url, "/api/admin/revisions");
  assert.equal(requests[0].init?.credentials, "include");
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
