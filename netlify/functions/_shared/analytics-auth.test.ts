import assert from "node:assert/strict";
import test from "node:test";

import type { Context } from "@netlify/functions";

import { createAnalyticsHandler } from "../analytics.ts";

const SITE_ORIGIN = "https://yyq-example.netlify.app";
const PAGES_ORIGIN = "https://mrxiaoxies.github.io";
const LOCAL_ADMIN_ORIGIN = "http://localhost:5173";
const DISALLOWED_ORIGIN = "https://attacker.example";

type StoredValue = Record<string, unknown>;

function shanghaiDayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).format(new Date());
}

function createFakeStore(seed: Record<string, StoredValue> = {}) {
  const values = new Map<string, StoredValue>(Object.entries(seed));
  const deleted: string[] = [];

  return {
    deleted,
    values,
    async delete(key: string) {
      deleted.push(key);
      values.delete(key);
    },
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async list({ prefix }: { prefix: string }) {
      return {
        blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
        directories: []
      };
    },
    async setJSON(key: string, value: StoredValue) {
      values.set(key, value);
    }
  };
}

function context(siteUrl = SITE_ORIGIN) {
  return { requestId: "analytics-test", site: { url: siteUrl } } as Context;
}

function request(
  path: string,
  {
    body,
    headers = {},
    method = "GET",
    origin = SITE_ORIGIN
  }: { body?: unknown; headers?: Record<string, string>; method?: string; origin?: string | null } = {}
) {
  const requestHeaders = new Headers(headers);
  if (origin) requestHeaders.set("Origin", origin);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
  return new Request(`${SITE_ORIGIN}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: requestHeaders,
    method
  });
}

function adminUser() {
  return { email: "admin@example.com", id: "admin-1", role: "admin" as const };
}

test("stats requires an administrator session before creating the analytics store", async () => {
  let storeCreations = 0;
  const handler = createAnalyticsHandler({
    authenticate: async () => null,
    getAnalyticsStore: () => {
      storeCreations += 1;
      return createFakeStore();
    }
  });

  const response = await handler(request("/api/stats"), context());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: { code: "unauthorized", message: "Administrator authentication is required." }
  });
  assert.equal(storeCreations, 0);
});

test("a matching legacy x-admin-token cannot authorize stats", async () => {
  const handler = createAnalyticsHandler({
    authenticate: async () => null,
    getAnalyticsStore: () => createFakeStore()
  });

  const response = await handler(
    request("/api/stats", { headers: { "x-admin-token": "legacy-secret" } }),
    context()
  );

  assert.equal(response.status, 401);
});

test("authenticated stats preserve the existing analytics response", async () => {
  const activeAt = new Date().toISOString();
  const store = createFakeStore({
    summary: {
      dayKey: shanghaiDayKey(),
      lastVisitAt: activeAt,
      todayVisits: 3,
      totalVisitors: 4,
      totalVisits: 9
    },
    "sessions/session-active": {
      city: "Shanghai",
      country: "China",
      firstSeenAt: activeAt,
      lastSeenAt: activeAt,
      page: "/projects",
      pageViews: 2,
      referrer: "direct",
      sessionId: "session-active",
      userAgent: "test-agent",
      visitorId: "visitor-active"
    }
  });
  const handler = createAnalyticsHandler({
    authenticate: async () => adminUser(),
    getAnalyticsStore: () => store
  });

  const response = await handler(request("/api/stats"), context());
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.totalVisits, 9);
  assert.equal(body.totalVisitors, 4);
  assert.equal(body.todayVisits, 3);
  assert.equal(body.onlineCount, 1);
  assert.equal(body.onlineWindowSeconds, 90);
  assert.deepEqual(body.recentVisitors, [
    {
      city: "Shanghai",
      country: "China",
      lastSeenAt: activeAt,
      page: "/projects",
      pageViews: 2,
      referrer: "direct",
      sessionId: "session-",
      userAgent: "test-agent"
    }
  ]);
});

test("public visits remain available and store sanitized identifiers and bounded fields", async () => {
  const store = createFakeStore();
  const handler = createAnalyticsHandler({
    authenticate: async () => null,
    getAnalyticsStore: () => store
  });
  const longPage = `/${"p".repeat(240)}`;
  const longReferrer = `https://example.com/${"r".repeat(260)}`;

  const response = await handler(
    request("/api/visit", {
      body: {
        page: longPage,
        referrer: longReferrer,
        sessionId: "ses.!@#-_01",
        userAgent: "test-agent",
        visitorId: "vis.!@#-_02"
      },
      method: "POST",
      origin: PAGES_ORIGIN
    }),
    context()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.ok(store.values.has("visitors/vis-_02"));
  const session = store.values.get("sessions/ses-_01");
  assert.equal(session?.sessionId, "ses-_01");
  assert.equal(session?.visitorId, "vis-_02");
  assert.equal((session?.page as string).length, 180);
  assert.equal((session?.referrer as string).length, 220);
});

test("public visits treat null and other non-object JSON as empty pageviews", async () => {
  for (const body of [null, "text", 42, true, []]) {
    const store = createFakeStore();
    const handler = createAnalyticsHandler({
      authenticate: async () => null,
      getAnalyticsStore: () => store
    });

    const response = await handler(
      request("/api/visit", { body, method: "POST", origin: PAGES_ORIGIN }),
      context()
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const sessions = [...store.values.entries()].filter(([key]) => key.startsWith("sessions/"));
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0][1].page, "/");
    assert.equal(sessions[0][1].pageViews, 1);
    assert.equal(sessions[0][1].referrer, "direct");
    assert.equal(store.values.get("summary")?.totalVisits, 1);
  }
});

test("visit CORS echoes exact Netlify, GitHub Pages, and configured public origins", async () => {
  const previous = process.env.KNOWLEDGE_ALLOWED_ORIGINS;
  process.env.KNOWLEDGE_ALLOWED_ORIGINS = "https://public-editor.example";
  try {
    for (const origin of [SITE_ORIGIN, PAGES_ORIGIN, "https://public-editor.example"]) {
      const handler = createAnalyticsHandler({
        authenticate: async () => null,
        getAnalyticsStore: () => createFakeStore()
      });
      const response = await handler(
        request("/api/visit", { body: {}, method: "POST", origin }),
        context()
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
      assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
      assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
    }
  } finally {
    if (previous === undefined) delete process.env.KNOWLEDGE_ALLOWED_ORIGINS;
    else process.env.KNOWLEDGE_ALLOWED_ORIGINS = previous;
  }
});

test("visit CORS rejects disallowed origins without a wildcard fallback", async () => {
  const handler = createAnalyticsHandler({
    authenticate: async () => null,
    getAnalyticsStore: () => createFakeStore()
  });

  const response = await handler(
    request("/api/visit", { body: {}, method: "POST", origin: DISALLOWED_ORIGIN }),
    context()
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("visit CORS rejects trailing-slash origin aliases before creating the store", async () => {
  for (const origin of [`${PAGES_ORIGIN}/`, `${SITE_ORIGIN}/`]) {
    let storeCreations = 0;
    const handler = createAnalyticsHandler({
      authenticate: async () => null,
      getAnalyticsStore: () => {
        storeCreations += 1;
        return createFakeStore();
      }
    });

    const response = await handler(
      request("/api/visit", { body: {}, method: "POST", origin }),
      context()
    );

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(storeCreations, 0);
  }
});

test("stats CORS is credentialed only for allowed administrator origins", async () => {
  for (const origin of [SITE_ORIGIN, LOCAL_ADMIN_ORIGIN]) {
    const handler = createAnalyticsHandler({
      authenticate: async () => adminUser(),
      getAnalyticsStore: () => createFakeStore()
    });
    const response = await handler(request("/api/stats", { origin }), context());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
    assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
  }

  for (const origin of [PAGES_ORIGIN, DISALLOWED_ORIGIN]) {
    const handler = createAnalyticsHandler({
      authenticate: async () => adminUser(),
      getAnalyticsStore: () => createFakeStore()
    });
    const response = await handler(request("/api/stats", { origin }), context());
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
});

test("analytics preflight keeps public and administrator CORS contracts separate", async () => {
  const handler = createAnalyticsHandler({
    authenticate: async () => null,
    getAnalyticsStore: () => createFakeStore()
  });
  const visit = await handler(
    request("/api/visit", {
      headers: { "Access-Control-Request-Method": "POST" },
      method: "OPTIONS",
      origin: PAGES_ORIGIN
    }),
    context()
  );
  assert.equal(visit.status, 204);
  assert.equal(visit.headers.get("Access-Control-Allow-Origin"), PAGES_ORIGIN);
  assert.equal(visit.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal(visit.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.equal(visit.headers.get("Access-Control-Allow-Credentials"), null);

  const stats = await handler(
    request("/api/stats", {
      headers: { "Access-Control-Request-Method": "GET" },
      method: "OPTIONS",
      origin: LOCAL_ADMIN_ORIGIN
    }),
    context()
  );
  assert.equal(stats.status, 204);
  assert.equal(stats.headers.get("Access-Control-Allow-Origin"), LOCAL_ADMIN_ORIGIN);
  assert.equal(stats.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  assert.equal(stats.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.equal(stats.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("authentication failures return a generic error without creating the store", async () => {
  let storeCreations = 0;
  const handler = createAnalyticsHandler({
    authenticate: async () => {
      throw new Error("sensitive authentication detail");
    },
    getAnalyticsStore: () => {
      storeCreations += 1;
      return createFakeStore();
    }
  });

  const response = await handler(request("/api/stats"), context());
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.doesNotMatch(body, /sensitive authentication detail/);
  assert.equal(storeCreations, 0);
});

test("analytics routes reject wrong methods and unknown paths", async () => {
  const handler = createAnalyticsHandler({
    authenticate: async () => adminUser(),
    getAnalyticsStore: () => createFakeStore()
  });

  const wrongVisitMethod = await handler(request("/api/visit", { method: "GET" }), context());
  const wrongStatsMethod = await handler(request("/api/stats", { body: {}, method: "POST" }), context());
  const missing = await handler(request("/api/unknown"), context());

  assert.equal(wrongVisitMethod.status, 405);
  assert.equal(wrongStatsMethod.status, 405);
  assert.equal(missing.status, 404);
});
