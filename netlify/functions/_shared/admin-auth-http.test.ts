import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "@netlify/functions";

import {
  createAdminAuthHandler,
  authenticateAdminRequest
} from "../admin-auth.ts";
import { ADMIN_BODY_LIMIT_BYTES, ADMIN_SESSION_COOKIE } from "./admin-security.ts";
import { AdminAuthError, type AdminAuthService, type PublicAdminUser } from "./admin-auth-service.ts";

const SITE_ORIGIN = "https://yyq-web.netlify.app";
const PAGES_ORIGIN = "https://mrxiaoxies.github.io";
const STRONG_PASSWORD = "correct horse battery staple";
const SESSION_TOKEN = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const ADMIN_USER: PublicAdminUser = { email: "admin@example.com", id: "admin-user", role: "admin" };

type ServiceCall = {
  input?: unknown;
  sessionToken?: string;
};

type StubService = AdminAuthService & {
  calls: {
    authenticate: ServiceCall[];
    login: ServiceCall[];
    logout: ServiceCall[];
    recover: ServiceCall[];
    setup: ServiceCall[];
  };
  failNext: Partial<Record<keyof AdminAuthService, unknown>>;
};

function context(origin = SITE_ORIGIN, ip = "203.0.113.10") {
  return {
    ip,
    requestId: "request-1",
    site: { url: origin }
  } as Context;
}

function createStubService(): StubService {
  const calls = {
    authenticate: [] as ServiceCall[],
    login: [] as ServiceCall[],
    logout: [] as ServiceCall[],
    recover: [] as ServiceCall[],
    setup: [] as ServiceCall[]
  };
  const failNext: StubService["failNext"] = {};
  const maybeFail = (method: keyof AdminAuthService) => {
    const failure = failNext[method];
    delete failNext[method];
    if (failure) throw failure;
  };

  return {
    calls,
    failNext,
    async authenticate(sessionToken) {
      maybeFail("authenticate");
      calls.authenticate.push({ sessionToken });
      return sessionToken === SESSION_TOKEN ? ADMIN_USER : null;
    },
    async login(input) {
      maybeFail("login");
      calls.login.push({ input });
      return { sessionToken: SESSION_TOKEN, user: ADMIN_USER };
    },
    async logout(sessionToken) {
      maybeFail("logout");
      calls.logout.push({ sessionToken });
    },
    async recover(input) {
      maybeFail("recover");
      calls.recover.push({ input });
      return { user: ADMIN_USER };
    },
    async setup(input) {
      maybeFail("setup");
      calls.setup.push({ input });
      return { sessionToken: SESSION_TOKEN, user: ADMIN_USER };
    }
  };
}

function createHandler(service = createStubService()) {
  return { handler: createAdminAuthHandler({ service, now: () => new Date("2026-08-26T10:00:00.000Z") }), service };
}

function adminRequest(action: string, options: RequestInit & { origin?: string | null } = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.origin === null) headers.delete("Origin");
  else if (options.origin !== undefined) headers.set("Origin", options.origin);
  else if (!headers.has("Origin")) headers.set("Origin", SITE_ORIGIN);

  return new Request(`${SITE_ORIGIN}/api/admin/auth?action=${action}`, {
    ...options,
    headers
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  const body = await readJson(response);
  assert.deepEqual((body.error as Record<string, unknown>).code, code);
  assert.equal(JSON.stringify(body).includes("setup-token-that-must-not-leak"), false);
  assert.equal(JSON.stringify(body).includes(STRONG_PASSWORD), false);
}

test("OPTIONS replies only to allowed admin origins with credentialed CORS", async () => {
  const { handler } = createHandler();
  const allowed = await handler(
    new Request(`${SITE_ORIGIN}/api/admin/auth`, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Headers": "Content-Type",
        "Access-Control-Request-Method": "POST",
        Origin: SITE_ORIGIN
      }
    }),
    context()
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
  assert.equal(allowed.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(allowed.headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
  assert.equal(allowed.headers.get("Access-Control-Allow-Headers"), "Content-Type");

  const githubPages = await handler(
    new Request(`${SITE_ORIGIN}/api/admin/auth`, {
      method: "OPTIONS",
      headers: { Origin: PAGES_ORIGIN }
    }),
    context()
  );
  assert.equal(githubPages.status, 403);
  assert.equal(githubPages.headers.get("Access-Control-Allow-Origin"), null);
});

test("setup and login set a host-safe cookie without serializing secrets", async () => {
  const { handler, service } = createHandler();
  const setupResponse = await handler(
    adminRequest("setup", {
      method: "POST",
      body: JSON.stringify({
        email: "ADMIN@example.com",
        password: STRONG_PASSWORD,
        setupToken: "setup-token-that-must-not-leak"
      })
    }),
    context()
  );
  assert.equal(setupResponse.status, 200);
  assert.match(setupResponse.headers.get("Set-Cookie") ?? "", new RegExp(`${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}`));
  assert.match(setupResponse.headers.get("Set-Cookie") ?? "", /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(setupResponse.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
  assert.equal(setupResponse.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(JSON.stringify(await readJson(setupResponse)), JSON.stringify({ user: ADMIN_USER }));

  const loginResponse = await handler(
    adminRequest("login", {
      method: "POST",
      headers: { "X-Forwarded-For": "198.51.100.88" },
      body: JSON.stringify({
        clientIp: "192.0.2.99",
        email: "ADMIN@example.com",
        password: STRONG_PASSWORD,
        rateLimitKey: "attacker-controlled"
      })
    }),
    context()
  );
  assert.equal(loginResponse.status, 422);

  const strictLogin = await handler(
    adminRequest("login", {
      method: "POST",
      headers: { "X-Forwarded-For": "198.51.100.88" },
      body: JSON.stringify({ email: "ADMIN@example.com", password: STRONG_PASSWORD })
    }),
    context(SITE_ORIGIN, "203.0.113.25")
  );
  assert.equal(strictLogin.status, 200);
  assert.deepEqual(service.calls.login.at(-1)?.input, {
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "admin@example.com|203.0.113.25"
  });

  const serialized = JSON.stringify(await readJson(strictLogin));
  assert.equal(/password|token|hash/i.test(serialized), false);
});

test("me is only GET action=me and fails closed for missing or bad sessions", async () => {
  const { handler, service } = createHandler();
  const withoutCookie = await handler(adminRequest("me", { method: "GET" }), context());
  await expectError(withoutCookie, 401, "unauthorized");
  assert.deepEqual(service.calls.authenticate.at(-1), { sessionToken: undefined });

  const withCookie = await handler(
    adminRequest("me", {
      method: "GET",
      headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}` }
    }),
    context()
  );
  assert.equal(withCookie.status, 200);
  assert.deepEqual(await readJson(withCookie), { user: ADMIN_USER });

  const wrongMethod = await handler(
    adminRequest("me", {
      method: "POST",
      body: JSON.stringify({})
    }),
    context()
  );
  await expectError(wrongMethod, 405, "method_not_allowed");

  const wrongGetAction = await handler(adminRequest("login", { method: "GET" }), context());
  await expectError(wrongGetAction, 405, "method_not_allowed");
});

test("logout and recover clear cookies only when the service succeeds", async () => {
  const { handler, service } = createHandler();
  const logout = await handler(
    adminRequest("logout", {
      method: "POST",
      headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}` },
      body: JSON.stringify({})
    }),
    context()
  );
  assert.equal(logout.status, 200);
  assert.deepEqual(service.calls.logout.at(-1), { sessionToken: SESSION_TOKEN });
  assert.match(logout.headers.get("Set-Cookie") ?? "", /Max-Age=0/);

  service.failNext.logout = new Error("simulated logout failure with token secret");
  const failedLogout = await handler(
    adminRequest("logout", {
      method: "POST",
      headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}` },
      body: JSON.stringify({})
    }),
    context()
  );
  assert.notEqual(failedLogout.status, 200);
  assert.equal((await failedLogout.text()).includes("simulated logout failure"), false);

  const recover = await handler(
    adminRequest("recover", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        newPassword: "new correct horse battery staple",
        recoveryToken: "recovery-token-that-must-not-leak"
      })
    }),
    context()
  );
  assert.equal(recover.status, 200);
  assert.match(recover.headers.get("Set-Cookie") ?? "", /Max-Age=0/);
  assert.equal(JSON.stringify(await readJson(recover)).includes("recovery-token-that-must-not-leak"), false);

  service.failNext.recover = new Error("simulated recover failure with password");
  const failedRecover = await handler(
    adminRequest("recover", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        newPassword: "new correct horse battery staple",
        recoveryToken: "recovery-token-that-must-not-leak"
      })
    }),
    context()
  );
  assert.notEqual(failedRecover.status, 200);
  assert.equal((await failedRecover.text()).includes("simulated recover failure"), false);
});

test("write actions require an allowed Origin and reject GitHub Pages management writes", async () => {
  const { handler } = createHandler();
  const missingOrigin = await handler(
    adminRequest("login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      origin: null,
      body: JSON.stringify({ email: "admin@example.com", password: STRONG_PASSWORD })
    }),
    context()
  );
  await expectError(missingOrigin, 403, "forbidden_origin");

  const pagesOrigin = await handler(
    adminRequest("login", {
      method: "POST",
      origin: PAGES_ORIGIN,
      body: JSON.stringify({ email: "admin@example.com", password: STRONG_PASSWORD })
    }),
    context()
  );
  await expectError(pagesOrigin, 403, "forbidden_origin");
});

test("JSON bodies are strict, bounded, and mapped without leaking input fragments", async () => {
  const { handler } = createHandler();
  await expectError(
    await handler(adminRequest("login", { method: "POST", body: "not-json" }), context()),
    422,
    "invalid_input"
  );
  await expectError(
    await handler(
      adminRequest("login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com", password: STRONG_PASSWORD, extra: true })
      }),
      context()
    ),
    422,
    "invalid_input"
  );
  await expectError(
    await handler(
      adminRequest("login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com" })
      }),
      context()
    ),
    422,
    "invalid_input"
  );
  await expectError(
    await handler(
      adminRequest("login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com", password: STRONG_PASSWORD }),
        headers: { "Content-Type": "text/plain" }
      }),
      context()
    ),
    415,
    "unsupported_media_type"
  );
  await expectError(
    await handler(
      adminRequest("login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com", password: STRONG_PASSWORD }),
        headers: { "Content-Length": String(ADMIN_BODY_LIMIT_BYTES + 1), "Content-Type": "application/json" }
      }),
      context()
    ),
    413,
    "body_too_large"
  );
});

test("service error codes map to the public HTTP contract", async () => {
  const errorCases: Array<[keyof AdminAuthService, AdminAuthError, number, string]> = [
    ["login", new AdminAuthError("invalid_credentials"), 401, "invalid_credentials"],
    ["login", new AdminAuthError("rate_limited"), 429, "rate_limited"],
    ["setup", new AdminAuthError("setup_closed"), 409, "setup_closed"],
    ["recover", new AdminAuthError("token_consumed"), 409, "token_consumed"],
    ["setup", new AdminAuthError("invalid_input"), 422, "invalid_input"],
    ["setup", new AdminAuthError("setup_unavailable"), 503, "missing_configuration"]
  ];

  for (const [method, error, status, code] of errorCases) {
    const { handler, service } = createHandler();
    service.failNext[method] = error;
    const action = method === "setup" ? "setup" : method === "recover" ? "recover" : "login";
    const body =
      action === "setup"
        ? { email: "admin@example.com", password: STRONG_PASSWORD, setupToken: "setup-token-that-must-not-leak" }
        : action === "recover"
          ? {
              email: "admin@example.com",
              newPassword: "new correct horse battery staple",
              recoveryToken: "recovery-token-that-must-not-leak"
            }
          : { email: "admin@example.com", password: STRONG_PASSWORD };

    await expectError(
      await handler(adminRequest(action, { method: "POST", body: JSON.stringify(body) }), context()),
      status,
      code
    );
  }
});

test("duplicate GET actions are rejected before me authentication", async () => {
  const { handler, service } = createHandler();

  const mixed = await handler(
    new Request(`${SITE_ORIGIN}/api/admin/auth?action=me&action=logout`, {
      method: "GET",
      headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}`, Origin: SITE_ORIGIN }
    }),
    context()
  );
  await expectError(mixed, 422, "invalid_input");

  const repeatedSame = await handler(
    new Request(`${SITE_ORIGIN}/api/admin/auth?action=me&action=me`, {
      method: "GET",
      headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}`, Origin: SITE_ORIGIN }
    }),
    context()
  );
  await expectError(repeatedSame, 422, "invalid_input");
  assert.equal(service.calls.authenticate.length, 0);
});

test("duplicate POST actions are rejected before logout side effects", async () => {
  const { handler, service } = createHandler();
  const response = await handler(
    new Request(`${SITE_ORIGIN}/api/admin/auth?action=logout&action=me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${ADMIN_SESSION_COOKIE}=${SESSION_TOKEN}`,
        Origin: SITE_ORIGIN
      },
      body: JSON.stringify({})
    }),
    context()
  );

  await expectError(response, 422, "invalid_input");
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(service.calls.logout.length, 0);
});
test("unknown and missing actions are rejected strictly", async () => {
  const { handler } = createHandler();
  await expectError(
    await handler(new Request(`${SITE_ORIGIN}/api/admin/auth`, { method: "GET", headers: { Origin: SITE_ORIGIN } }), context()),
    422,
    "invalid_input"
  );
  await expectError(await handler(adminRequest("unknown", { method: "POST", body: JSON.stringify({}) }), context()), 404, "not_found");
  await expectError(await handler(adminRequest("unknown", { method: "GET" }), context()), 404, "not_found");
});

test("authenticateAdminRequest parses the default cookie path fail closed", async () => {
  assert.equal(
    await authenticateAdminRequest(
      new Request(`${SITE_ORIGIN}/api/admin/content`, {
        headers: { Cookie: `${ADMIN_SESSION_COOKIE}=bad-token` }
      })
    ),
    null
  );
});
