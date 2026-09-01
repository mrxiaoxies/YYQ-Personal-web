import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "@netlify/functions";

import { defaultSiteContent } from "../../../shared/default-site-content.ts";
import type { SiteContentDocument, SiteContentUpdate } from "../../../shared/site-content-schema.ts";
import { createSiteContentHandler } from "../site-content.ts";
import type { PublicAdminUser } from "./admin-auth-service.ts";
import {
  SiteContentStoreError,
  type RevisionSummary,
  type SiteContentStore
} from "./site-content-store.ts";

const SITE_ORIGIN = "https://yyq-web.netlify.app";
const PAGES_ORIGIN = "https://mrxiaoxies.github.io";
const LOCAL_ADMIN_ORIGIN = "http://localhost:5173";
const ADMIN_USER: PublicAdminUser = { email: "admin@example.com", id: "admin-user", role: "admin" };
const REVISION: RevisionSummary = {
  actorEmail: ADMIN_USER.email,
  createdAt: "2026-08-26T10:00:00.000Z",
  id: "2026-08-26T10:00:00.000Z-123e4567-e89b-42d3-a456-426614174000",
  reason: "save",
  sourceVersion: defaultSiteContent.version
};

type StoreCall = { actor?: PublicAdminUser; expectedVersion?: string; revisionId?: string; update?: SiteContentUpdate };

type StubStore = SiteContentStore & {
  calls: {
    getCurrent: StoreCall[];
    listRevisions: StoreCall[];
    restore: StoreCall[];
    save: StoreCall[];
  };
  failNext: Partial<Record<keyof SiteContentStore, unknown>>;
};

function context(origin = SITE_ORIGIN) {
  return {
    requestId: "request-1",
    site: { url: origin }
  } as Context;
}

function publishedDocument(version = "content-published"): SiteContentDocument {
  return {
    ...structuredClone(defaultSiteContent),
    updatedAt: "2026-08-26T10:00:00.000Z",
    version
  };
}

function validUpdate(): SiteContentUpdate {
  return {
    expectedVersion: defaultSiteContent.version,
    sections: structuredClone(defaultSiteContent.sections)
  };
}

function createStubStore(): StubStore {
  const calls = {
    getCurrent: [] as StoreCall[],
    listRevisions: [] as StoreCall[],
    restore: [] as StoreCall[],
    save: [] as StoreCall[]
  };
  const failNext: StubStore["failNext"] = {};
  const maybeFail = (method: keyof SiteContentStore) => {
    const error = failNext[method];
    delete failNext[method];
    if (error !== undefined) throw error;
  };

  return {
    calls,
    failNext,
    async getCurrent() {
      maybeFail("getCurrent");
      calls.getCurrent.push({});
      return structuredClone(defaultSiteContent);
    },
    async listRevisions() {
      maybeFail("listRevisions");
      calls.listRevisions.push({});
      return [REVISION];
    },
    async restore(revisionId, expectedVersion, actor) {
      maybeFail("restore");
      calls.restore.push({ actor, expectedVersion, revisionId });
      return publishedDocument("content-restored");
    },
    async save(update, actor) {
      maybeFail("save");
      calls.save.push({ actor, update });
      return { document: publishedDocument(), revision: REVISION };
    }
  };
}

function createHandler(input: {
  authenticate?: (req: Request) => Promise<PublicAdminUser | null>;
  store?: StubStore;
} = {}) {
  const store = input.store ?? createStubStore();
  const authenticate = input.authenticate ?? (async () => ADMIN_USER);
  return {
    handler: createSiteContentHandler({ authenticate, contentStore: store }),
    store
  };
}

function request(path: string, options: RequestInit & { origin?: string | null } = {}) {
  const headers = new Headers(options.headers);
  if (options.origin === null) headers.delete("Origin");
  else if (options.origin !== undefined) headers.set("Origin", options.origin);
  else if (path.startsWith("/api/admin/")) headers.set("Origin", SITE_ORIGIN);
  if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  return new Request(`${SITE_ORIGIN}${path}`, { ...options, headers });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  const body = await readJson(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);
  return body;
}

test("public GET returns only the current site content document with no-store", async () => {
  const { handler } = createHandler();
  const response = await handler(request("/api/site-content", { method: "GET" }), context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await readJson(response);
  assert.deepEqual(body, defaultSiteContent);
  assert.deepEqual(Object.keys(body as Record<string, unknown>).sort(), ["schemaVersion", "sections", "updatedAt", "version"]);
  assert.equal(/"(?:account|passwordHash|session|user)"\s*:/i.test(JSON.stringify(body)), false);
});

test("public GET returns the exact GitHub Pages CORS origin without credentials", async () => {
  const { handler } = createHandler();
  const response = await handler(
    request("/api/site-content", { method: "GET", origin: PAGES_ORIGIN }),
    context()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), PAGES_ORIGIN);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
});

test("public GET accepts an exact configured public site origin", async () => {
  const previous = process.env.PUBLIC_SITE_ALLOWED_ORIGINS;
  process.env.PUBLIC_SITE_ALLOWED_ORIGINS = "https://public-site.example";
  try {
    const { handler } = createHandler();
    const response = await handler(
      request("/api/site-content", { method: "GET", origin: "https://public-site.example" }),
      context()
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://public-site.example");
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_SITE_ALLOWED_ORIGINS;
    else process.env.PUBLIC_SITE_ALLOWED_ORIGINS = previous;
  }
});

test("admin restore OPTIONS validates target POST and returns credentialed CORS", async () => {
  const { handler } = createHandler();
  const response = await handler(
    request("/api/admin/content?action=restore", {
      method: "OPTIONS",
      origin: LOCAL_ADMIN_ORIGIN,
      headers: {
        "Access-Control-Request-Headers": "Content-Type",
        "Access-Control-Request-Method": "POST"
      }
    }),
    context()
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), LOCAL_ADMIN_ORIGIN);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "PUT, POST, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type");
});

test("admin preflight rejects duplicate actions, unknown actions, and wrong target methods", async () => {
  const { handler } = createHandler();
  const preflight = (path: string, targetMethod: string) => handler(
    request(path, {
      method: "OPTIONS",
      origin: LOCAL_ADMIN_ORIGIN,
      headers: { "Access-Control-Request-Method": targetMethod }
    }),
    context()
  );

  await expectError(
    await preflight("/api/admin/content?action=restore&action=restore", "POST"),
    422,
    "invalid_input"
  );
  await expectError(
    await preflight("/api/admin/content?action=publish", "POST"),
    404,
    "not_found"
  );
  await expectError(
    await preflight("/api/admin/content?action=restore", "PUT"),
    422,
    "invalid_input"
  );
  await expectError(
    await preflight("/api/admin/content?action=restore", "DELETE"),
    405,
    "method_not_allowed"
  );
});

test("admin content PUT without a valid session returns 401", async () => {
  const { handler, store } = createHandler({ authenticate: async () => null });
  const response = await handler(
    request("/api/admin/content", { method: "PUT", body: JSON.stringify(validUpdate()) }),
    context()
  );

  await expectError(response, 401, "unauthorized");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(store.calls.save.length, 0);
});

test("admin content PUT rejects unknown update fields with 422", async () => {
  const { handler, store } = createHandler();
  const response = await handler(
    request("/api/admin/content", {
      method: "PUT",
      body: JSON.stringify({ ...validUpdate(), password: "must-not-be-accepted" })
    }),
    context()
  );

  await expectError(response, 422, "invalid_input");
  assert.equal(store.calls.save.length, 0);
});

test("admin content PUT publishes a valid update as the authenticated actor", async () => {
  const { handler, store } = createHandler();
  const update = validUpdate();
  const response = await handler(
    request("/api/admin/content", { method: "PUT", body: JSON.stringify(update) }),
    context()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), publishedDocument());
  assert.deepEqual(store.calls.save, [{ actor: ADMIN_USER, update }]);
});

test("stale expectedVersion maps content conflict to 409", async () => {
  const store = createStubStore();
  store.failNext.save = new SiteContentStoreError("content_conflict", "secret current version");
  const { handler } = createHandler({ store });
  const response = await handler(
    request("/api/admin/content", { method: "PUT", body: JSON.stringify(validUpdate()) }),
    context()
  );

  const body = await expectError(response, 409, "content_conflict");
  assert.equal(JSON.stringify(body).includes("secret current version"), false);
});

test("store validation and conflict errors outside publish conflicts map to 503", async () => {
  const cases: Array<{
    error: SiteContentStoreError;
    method: keyof SiteContentStore;
    path: string;
    requestInit: RequestInit;
  }> = [
    {
      error: new SiteContentStoreError("content_conflict", "secret read conflict"),
      method: "getCurrent",
      path: "/api/site-content",
      requestInit: { method: "GET" }
    },
    {
      error: new SiteContentStoreError("invalid_content", "secret revisions corruption"),
      method: "listRevisions",
      path: "/api/admin/revisions",
      requestInit: { method: "GET" }
    },
    {
      error: new SiteContentStoreError("invalid_content", "secret save validation"),
      method: "save",
      path: "/api/admin/content",
      requestInit: { method: "PUT", body: JSON.stringify(validUpdate()) }
    },
    {
      error: new SiteContentStoreError("invalid_content", "secret restore validation"),
      method: "restore",
      path: "/api/admin/content?action=restore",
      requestInit: {
        method: "POST",
        body: JSON.stringify({ revisionId: REVISION.id, expectedVersion: defaultSiteContent.version })
      }
    }
  ];

  for (const item of cases) {
    const store = createStubStore();
    store.failNext[item.method] = item.error;
    const { handler } = createHandler({ store });
    const response = await handler(request(item.path, item.requestInit), context());
    const body = await expectError(response, 503, "service_unavailable");
    assert.equal(JSON.stringify(body).includes(item.error.message), false);
  }
});

test("admin revisions GET returns revision summaries for an authenticated session", async () => {
  const { handler, store } = createHandler();
  const response = await handler(request("/api/admin/revisions", { method: "GET" }), context());

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), [REVISION]);
  assert.equal(store.calls.listRevisions.length, 1);
});

test("admin restore POST publishes the selected revision as a new document", async () => {
  const { handler, store } = createHandler();
  const response = await handler(
    request("/api/admin/content?action=restore", {
      method: "POST",
      body: JSON.stringify({ revisionId: REVISION.id, expectedVersion: defaultSiteContent.version })
    }),
    context()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), publishedDocument("content-restored"));
  assert.deepEqual(store.calls.restore, [{
    actor: ADMIN_USER,
    expectedVersion: defaultSiteContent.version,
    revisionId: REVISION.id
  }]);
});

test("duplicate restore actions are rejected before authentication and storage", async () => {
  let authenticationCalls = 0;
  const { handler, store } = createHandler({
    authenticate: async () => {
      authenticationCalls += 1;
      return ADMIN_USER;
    }
  });
  const response = await handler(
    request("/api/admin/content?action=restore&action=restore", {
      method: "POST",
      body: JSON.stringify({ revisionId: REVISION.id, expectedVersion: defaultSiteContent.version })
    }),
    context()
  );

  await expectError(response, 422, "invalid_input");
  assert.equal(authenticationCalls, 0);
  assert.equal(store.calls.restore.length, 0);
});

test("admin routes reject GitHub Pages as a management origin before authentication", async () => {
  let authenticationCalls = 0;
  const { handler } = createHandler({
    authenticate: async () => {
      authenticationCalls += 1;
      return ADMIN_USER;
    }
  });
  const response = await handler(
    request("/api/admin/revisions", { method: "GET", origin: PAGES_ORIGIN }),
    context()
  );

  await expectError(response, 403, "forbidden_origin");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(authenticationCalls, 0);
});

test("mutating routes require application/json and enforce the 128 KiB body limit", async () => {
  const { handler, store } = createHandler();
  const wrongMedia = await handler(
    request("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(validUpdate())
    }),
    context()
  );
  await expectError(wrongMedia, 415, "unsupported_media_type");

  const tooLarge = await handler(
    request("/api/admin/content", {
      method: "PUT",
      body: JSON.stringify({ padding: "x".repeat(128 * 1024) })
    }),
    context()
  );
  await expectError(tooLarge, 413, "body_too_large");
  assert.equal(store.calls.save.length, 0);
});

test("restore body and route methods are strict", async () => {
  const { handler, store } = createHandler();
  const unknownField = await handler(
    request("/api/admin/content?action=restore", {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: defaultSiteContent.version,
        revisionId: REVISION.id,
        sections: defaultSiteContent.sections
      })
    }),
    context()
  );
  await expectError(unknownField, 422, "invalid_input");

  await expectError(
    await handler(request("/api/admin/content", { method: "GET" }), context()),
    405,
    "method_not_allowed"
  );
  await expectError(
    await handler(request("/api/not-a-content-route", { method: "GET" }), context()),
    404,
    "not_found"
  );
  assert.equal(store.calls.restore.length, 0);
});

test("restore rejects malformed revision ids before calling storage", async () => {
  const { handler, store } = createHandler();
  const response = await handler(
    request("/api/admin/content?action=restore", {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: defaultSiteContent.version,
        revisionId: "../not-a-revision"
      })
    }),
    context()
  );

  await expectError(response, 422, "invalid_input");
  assert.equal(store.calls.restore.length, 0);
});

test("each route rejects every query parameter outside its exact contract", async () => {
  let authenticationCalls = 0;
  const { handler, store } = createHandler({
    authenticate: async () => {
      authenticationCalls += 1;
      return ADMIN_USER;
    }
  });
  const cases: Array<{ path: string; requestInit: RequestInit }> = [
    { path: "/api/site-content?preview=true", requestInit: { method: "GET" } },
    { path: "/api/admin/revisions?limit=20", requestInit: { method: "GET" } },
    {
      path: "/api/admin/content?draft=true",
      requestInit: { method: "PUT", body: JSON.stringify(validUpdate()) }
    },
    {
      path: "/api/admin/content?action=restore&revision=extra",
      requestInit: {
        method: "POST",
        body: JSON.stringify({ revisionId: REVISION.id, expectedVersion: defaultSiteContent.version })
      }
    }
  ];

  for (const item of cases) {
    await expectError(
      await handler(request(item.path, item.requestInit), context()),
      422,
      "invalid_input"
    );
  }
  assert.equal(authenticationCalls, 0);
  assert.deepEqual(store.calls, { getCurrent: [], listRevisions: [], restore: [], save: [] });
});

test("unexpected authentication and storage failures return generic 500 and 503 errors", async () => {
  const authFailure = createHandler({
    authenticate: async () => {
      throw new Error("secret authentication backend details");
    }
  });
  const authResponse = await authFailure.handler(
    request("/api/admin/revisions", { method: "GET" }),
    context()
  );
  const authBody = await expectError(authResponse, 500, "internal_error");
  assert.equal(JSON.stringify(authBody).includes("secret authentication backend details"), false);

  const store = createStubStore();
  store.failNext.getCurrent = new Error("secret Blob credentials");
  const storageFailure = createHandler({ store });
  const storageResponse = await storageFailure.handler(request("/api/site-content", { method: "GET" }), context());
  const storageBody = await expectError(storageResponse, 503, "service_unavailable");
  assert.equal(JSON.stringify(storageBody).includes("secret Blob credentials"), false);
});
