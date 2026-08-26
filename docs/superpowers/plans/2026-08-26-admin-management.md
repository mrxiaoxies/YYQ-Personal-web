# Personal Site Admin Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted administrator account, authenticated `#admin` management interface, immediate publishing for six site sections, analytics integration, and revision restore on Netlify.

**Architecture:** A shared strict TypeScript content schema and built-in defaults feed both the React site and Netlify Functions. Netlify Blobs stores administrator records, hashed sessions, current content, and bounded revision snapshots; Netlify Functions own password hashing, cookie authentication, origin checks, conditional writes, and public content reads. The React app fetches dynamic content with a built-in fallback, sends GitHub Pages administrators to the Netlify origin, and renders login, analytics, editors, and revision controls inside the existing `#admin` view.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Node.js 24 `node:test`, Node `crypto`, Netlify Functions 5, Netlify Blobs 10.7, Tailwind CSS 3.

**Spec:** `docs/superpowers/specs/2026-08-26-admin-management-design.md`

## Global Constraints

- Keep `knowledge/index.json` and the RAG vector workflow outside the admin editor.
- Keep seasonal backgrounds, layout, animation, fonts, QR image, and navigation behavior code-controlled.
- Allow content changes only for Home, Codex, Showcase, Skills, Resume, and Contact.
- Save means publish immediately; every successful change creates a recoverable revision.
- Use Node `crypto.scrypt` with a unique salt; never persist plaintext passwords, setup tokens, recovery tokens, or session tokens.
- Use one administrator in v1 while retaining `role: "admin"` and `active` fields.
- Use an `HttpOnly; Secure; SameSite=Lax; Path=/` session cookie with a seven-day lifetime.
- Restrict admin writes to the Netlify site origin and configured local origins; public content reads may also allow `https://mrxiaoxies.github.io`.
- Treat all JSON inputs as strict: reject unknown fields, unsafe URLs, invalid IDs, empty required strings, excessive arrays, and oversized bodies.
- External links must use `http://` or `https://`; the existing Showcase download may use a traversal-safe `files/...` public asset path.
- Retain current hard-coded content as the failure fallback so public pages never blank when the content API is unavailable.
- Do not commit `dist/`, `node_modules/`, `.env*`, `.netlify/`, `outputs/`, Blob data, backups, or secrets.
- Release this public feature as `0.4.0`, synchronizing `package.json`, top-level `package-lock.json`, `VERSION`, and `CHANGELOG.md`.

---

## File Structure

### Shared content contract

- Create `shared/site-content-schema.ts`: content types, limits, strict parsers, ID/URL/asset-path validation, update payload validation.
- Create `shared/default-site-content.ts`: stable IDs and the current six-section content moved out of `src/App.tsx`.
- Create `shared/site-content-schema.test.ts`: strict schema and default-content tests.

### Netlify authentication and storage

- Create `netlify/functions/_shared/admin-security.ts`: scrypt, token hashing, timing-safe comparison, cookie creation/parsing, origin checks, body limits.
- Create `netlify/functions/_shared/admin-security.test.ts`: cryptography, cookie, and origin tests.
- Create `netlify/functions/_shared/admin-store.ts`: typed `yyq-site-admin` Blob adapter and injectable in-memory store contract.
- Create `netlify/functions/_shared/admin-auth-service.ts`: setup, login, session lookup, logout, recovery, failed-attempt limits.
- Create `netlify/functions/_shared/admin-auth-service.test.ts`: service behavior tests with a deterministic in-memory store and clock.
- Create `netlify/functions/admin-auth.ts`: HTTP adapter for `/api/admin/auth`.
- Create `netlify/functions/_shared/admin-auth-http.test.ts`: request/response and cookie contract tests.

### Netlify content and analytics

- Create `netlify/functions/_shared/site-content-store.ts`: built-in fallback, ETag conditional writes, revision list/restore, retention.
- Create `netlify/functions/_shared/site-content-store.test.ts`: optimistic concurrency and revision tests.
- Create `netlify/functions/site-content.ts`: public and protected content routes.
- Create `netlify/functions/_shared/site-content-http.test.ts`: CORS, auth, validation, save, and restore HTTP tests.
- Modify `netlify/functions/analytics.ts`: replace `x-admin-token` with session authentication and exact CORS behavior.
- Create `netlify/functions/_shared/analytics-auth.test.ts`: protected stats regression tests.

### React public content and admin UI

- Create `src/lib/site-content-client.ts`: endpoint selection, public fetch, fallback parsing.
- Create `src/lib/site-content-client.test.ts`: Netlify/GitHub/local endpoint and fallback tests.
- Create `src/hooks/use-site-content.ts`: one-time load and published-content state.
- Create `src/lib/admin-api.ts`: credentialed auth/content/stats/revision client and normalized errors.
- Create `src/lib/admin-api.test.ts`: request credentials, status mapping, and endpoint tests.
- Create `src/components/admin/AdminApp.tsx`: admin state machine and Pages redirect notice.
- Create `src/components/admin/AdminAuthView.tsx`: login, setup, and recovery forms.
- Create `src/components/admin/AdminHome.tsx`: metrics, section cards, recent visitors, revisions, logout.
- Create `src/components/admin/AdminSectionEditor.tsx`: editor shell, save/conflict state, list operations.
- Create `src/components/admin/section-editors.tsx`: typed forms for the six section shapes.
- Modify `src/App.tsx`: consume dynamic content, pass content into timeline/contact views, remove the old token dashboard, mount `AdminApp`.
- Modify `src/index.css`: focused admin form, navigation, status, and mobile styles.

### Configuration and operations

- Modify `package.json`: include new tests and set `0.4.0`.
- Modify `package-lock.json`: synchronize `0.4.0`; no new package is required.
- Modify `.env.example`: document public admin/content origins and secret server variables with safe example values.
- Modify `docs/OPERATIONS.md`: setup, recovery, local limitations, Draft verification, and rollback runbook.
- Modify `README.md`: describe the dynamic content/admin boundary.
- Modify `CHANGELOG.md`: add the dated `0.4.0` entry.
- Modify `VERSION`: set `0.4.0`.

---

### Task 1: Shared Content Contract and Built-in Defaults

**Files:**
- Create: `shared/site-content-schema.ts`
- Create: `shared/default-site-content.ts`
- Create: `shared/site-content-schema.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Produces: `SiteContentSections`, `SiteContentDocument`, `SiteContentUpdate`, `parseSiteContentSections(value)`, `parseSiteContentDocument(value)`, `parseSiteContentUpdate(value)`, `defaultSiteContent`.
- Consumes: existing `codexProjects`, `skillGroups`, `resumeCompanies`, and the Home/Showcase/Contact literals in `src/App.tsx` as migration source only.

- [ ] **Step 1: Write strict schema tests before the parser**

Create tests that prove defaults parse and strict boundaries reject bad input:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent } from "./default-site-content.ts";
import { parseSiteContentDocument, parseSiteContentUpdate } from "./site-content-schema.ts";

test("built-in site content satisfies schema v1", () => {
  const parsed = parseSiteContentDocument(defaultSiteContent);
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(Object.keys(parsed.sections), ["home", "codex", "showcase", "skills", "resume", "contact"]);
});

test("content update rejects unknown fields and unsafe targets", () => {
  const unknown = structuredClone(defaultSiteContent) as Record<string, unknown>;
  unknown.extra = true;
  assert.throws(() => parseSiteContentDocument(unknown), /extra/);

  const update = {
    expectedVersion: defaultSiteContent.version,
    sections: structuredClone(defaultSiteContent.sections)
  };
  update.sections.codex.projects[0].links = [{ id: "bad-link", label: "bad", href: "javascript:alert(1)" }];
  assert.throws(() => parseSiteContentUpdate(update), /href/);
});

test("showcase allows safe public files and rejects traversal", () => {
  const safe = structuredClone(defaultSiteContent);
  safe.sections.showcase.downloadHref = "files/YYQ个人网站测试用例-标准格式.xlsx";
  assert.doesNotThrow(() => parseSiteContentDocument(safe));

  safe.sections.showcase.downloadHref = "files/../.env";
  assert.throws(() => parseSiteContentDocument(safe), /downloadHref/);
});
```

- [ ] **Step 2: Run the new test and verify the expected failure**

Run: `node --test shared/site-content-schema.test.ts`

Expected: FAIL because `site-content-schema.ts` and `default-site-content.ts` do not exist.

- [ ] **Step 3: Implement types, strict helpers, and parsers**

Define stable IDs on every mutable list item and these top-level interfaces:

```ts
export const SITE_CONTENT_SCHEMA_VERSION = 1 as const;

export type SiteContentSections = {
  home: HomeSection;
  codex: CodexSection;
  showcase: ShowcaseSection;
  skills: SkillsSection;
  resume: ResumeSection;
  contact: ContactSection;
};

export type SiteContentDocument = {
  schemaVersion: typeof SITE_CONTENT_SCHEMA_VERSION;
  version: string;
  updatedAt: string;
  sections: SiteContentSections;
};

export type SiteContentUpdate = {
  expectedVersion: string;
  sections: SiteContentSections;
};
```

Use helpers with exact limits:

```ts
const MAX_DOCUMENT_BYTES = 128 * 1024;
const MAX_TEXT = 2_000;
const MAX_SHORT_TEXT = 160;
const MAX_LIST_ITEMS = 60;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

function strictObject(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown>;
function requiredText(value: unknown, path: string, maxLength?: number): string;
function optionalText(value: unknown, path: string, maxLength?: number): string;
function stableId(value: unknown, path: string): string;
function externalUrl(value: unknown, path: string): string;
function downloadTarget(value: unknown, path: string): string;
function boundedArray<T>(value: unknown, path: string, parseItem: (item: unknown, index: number) => T): T[];
```

`strictObject` must report unknown keys, `externalUrl` must accept only `http:` and `https:`, and `downloadTarget` must additionally accept `files/<name>` only when it contains no `..`, backslash, query, or fragment. `parseSiteContentUpdate` must reject JSON larger than `MAX_DOCUMENT_BYTES` after `JSON.stringify`.

- [ ] **Step 4: Move all current content into one built-in document**

Create `defaultSiteContent` with:

```ts
export const defaultSiteContent: SiteContentDocument = {
  schemaVersion: 1,
  version: "builtin-0.3.1",
  updatedAt: "2026-08-13T00:00:00.000Z",
  sections: {
    home: {
      eyebrow: "Software Test Engineer / AI Workflow Builder",
      titleLines: ["把复杂流程", "测试到安静可靠。"],
      subtitle: "杨烨齐｜软件测试工程师 · Linux 环境搭建 / 接口 / 数据验证",
      primaryActionLabel: "查看项目进度",
      secondaryActionLabel: "下载简历信息"
    },
    contact: {
      eyebrow: "Reach Me",
      title: "上海市普陀区 · 杨烨齐",
      details: "17601252443 · 2279113571@qq.com",
      modalTitle: "WeChat",
      modalRegion: "中国大陆",
      modalDescription: "扫二维码，添加我为朋友。",
      phone: "17601252443",
      email: "2279113571@qq.com"
    }
  }
};
```

The code block intentionally shows the two smallest section shapes. In the same `sections` object, add the other four required keys using these exact source mappings without rewriting copy:

- `codex`: section heading from `src/App.tsx:1760-1767`, every object in `codexProjects` from `src/App.tsx:230-405`, and stable IDs `codex-personal-site`, `codex-auto-editing`, `codex-wechat-ai` plus `<project-id>-timeline-<1-based-index>` for timeline entries;
- `showcase`: heading/card text from `src/App.tsx:1838-1877`, tags `XLSX`, `标准测试格式`, `首页 · 导航 · 页面展示`, label `下载用例`, and target `files/YYQ个人网站测试用例-标准格式.xlsx`;
- `skills`: heading from `src/App.tsx:1879-1887` and every group/item from `skillGroups` at `src/App.tsx:407-424`, with group IDs `skills-ai`, `skills-black-box`, `skills-gray-box`, `skills-api-data` and `<group-id>-item-<1-based-index>` item IDs;
- `resume`: heading from `src/App.tsx:1904-1909` and every company/project/point from `resumeCompanies` at `src/App.tsx:426-497`, with company IDs derived once as stable ASCII slugs and nested IDs `<company-id>-project-<1-based-index>` and `<project-id>-point-<1-based-index>`.

The final `sections` object must contain all six keys in the schema test's asserted order, and no existing project, timeline, skill, company, project point, title, date, or description may be dropped.

- [ ] **Step 5: Run focused tests and the existing suite**

Run: `node --test shared/site-content-schema.test.ts`

Expected: all shared schema tests PASS.

Run: `npm test`

Expected: the existing RAG suite remains green.

- [ ] **Step 6: Add the shared test to the standard suite and commit**

Add `shared/site-content-schema.test.ts` to `test:rag` in `package.json`, then run `npm test` again.

```powershell
git add shared/site-content-schema.ts shared/default-site-content.ts shared/site-content-schema.test.ts package.json
git commit -m "feat: define editable site content"
```

---

### Task 2: Authentication Security Primitives

**Files:**
- Create: `netlify/functions/_shared/admin-security.ts`
- Create: `netlify/functions/_shared/admin-security.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Produces: `hashPassword(password)`, `verifyPassword(password, record)`, `hashSecret(value)`, `safeSecretEqual(left, right)`, `createSessionToken()`, `sessionCookie(token)`, `clearSessionCookie()`, `readSessionCookie(req)`, `resolveAdminRequestOrigin(req, context)`, `readBoundedJson(req, maxBytes)`.
- Consumes: `getNetlifyEnv` from `netlify/functions/_shared/netlify-http.ts`.

- [ ] **Step 1: Write failing security tests**

Cover unique salts, valid/invalid passwords, cookie flags, missing cookies, exact origins, malformed origins, and a body over 128 KiB:

```ts
test("password hashing uses scrypt with unique salts", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first.salt, second.salt);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("session cookie is host-safe and script-inaccessible", () => {
  const cookie = sessionCookie("session-token");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=604800/i);
  assert.match(cookie, /Path=\//i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test netlify/functions/_shared/admin-security.test.ts`

Expected: FAIL because `admin-security.ts` is missing.

- [ ] **Step 3: Implement cryptography and HTTP helpers**

Use these exact constants and return shapes:

```ts
export const ADMIN_SESSION_COOKIE = "yyq_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_BODY_LIMIT_BYTES = 128 * 1024;

export type PasswordDigest = {
  algorithm: "scrypt";
  digest: string;
  salt: string;
};

export async function hashPassword(password: string): Promise<PasswordDigest>;
export async function verifyPassword(password: string, digest: PasswordDigest): Promise<boolean>;
export function hashSecret(value: string): string;
export function createSessionToken(): string;
```

Use `randomBytes(16)` for salts, `randomBytes(32).toString("base64url")` for session tokens, `scrypt` with a 64-byte output, and `timingSafeEqual` after equal-length checks. Reject passwords outside 12–128 characters before hashing.

Origin validation must allow the request URL origin, `context.site?.url`, local `5173/8888` origins, and `ADMIN_ALLOWED_ORIGINS`. It must not allow GitHub Pages for administrator writes.

- [ ] **Step 4: Run tests and register them**

Run: `node --test netlify/functions/_shared/admin-security.test.ts`

Expected: PASS.

Add the test path to `test:rag`, then run `npm test`.

- [ ] **Step 5: Commit security primitives**

```powershell
git add netlify/functions/_shared/admin-security.ts netlify/functions/_shared/admin-security.test.ts package.json
git commit -m "feat: add admin security primitives"
```

---

### Task 3: Administrator Blob Store and Auth Service

**Files:**
- Create: `netlify/functions/_shared/admin-store.ts`
- Create: `netlify/functions/_shared/admin-auth-service.ts`
- Create: `netlify/functions/_shared/admin-auth-service.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: security functions from Task 2 and `@netlify/blobs`.
- Produces: `AdminUser`, `AdminSession`, `AdminStore`, `createBlobAdminStore()`, `createAdminAuthService(deps)` and service methods `setup`, `login`, `authenticate`, `logout`, `recover`.

- [ ] **Step 1: Write failing service tests with an in-memory store**

Required cases:

```ts
test("setup succeeds once and permanently consumes the setup token", async () => {
  const service = createTestService({ setupToken: "setup-token-that-is-long-enough" });
  const first = await service.setup({ email: "ADMIN@example.com", password: strongPassword, setupToken: setupToken });
  assert.equal(first.user.email, "admin@example.com");
  await assert.rejects(
    service.setup({ email: "second@example.com", password: strongPassword, setupToken }),
    (error: unknown) => error instanceof AdminAuthError && error.code === "setup_closed"
  );
});

test("login creates a hashed seven-day session and generic failures", async () => {
  const harness = await createInitializedHarness();
  const result = await harness.service.login({
    email: "admin@example.com",
    password: strongPassword,
    rateLimitKey: "admin@example.com|203.0.113.10"
  });
  const stored = await harness.store.getSession(hashSecret(result.sessionToken));
  assert.ok(stored);
  assert.equal(stored.tokenHash, hashSecret(result.sessionToken));
  assert.notEqual(stored.tokenHash, result.sessionToken);
  assert.equal(new Date(stored.expiresAt).getTime() - harness.clock.now().getTime(), 7 * 24 * 60 * 60 * 1000);
  await assert.rejects(
    harness.service.login({ email: "missing@example.com", password: strongPassword, rateLimitKey: "missing|ip" }),
    (error: unknown) => error instanceof AdminAuthError && error.code === "invalid_credentials"
  );
});

test("five failed attempts in fifteen minutes produce a 429 lock", async () => {
  const harness = await createInitializedHarness();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(harness.service.login({
      email: "admin@example.com",
      password: "wrong-password-value",
      rateLimitKey: "admin@example.com|203.0.113.10"
    }));
  }
  await assert.rejects(
    harness.service.login({ email: "admin@example.com", password: strongPassword, rateLimitKey: "admin@example.com|203.0.113.10" }),
    (error: unknown) => error instanceof AdminAuthError && error.code === "rate_limited"
  );
});

test("recovery token is one-time and clears every previous session", async () => {
  const harness = await createInitializedHarness();
  const first = await harness.service.login({ email: "admin@example.com", password: strongPassword, rateLimitKey: "first" });
  const second = await harness.service.login({ email: "admin@example.com", password: strongPassword, rateLimitKey: "second" });
  await harness.service.recover({ email: "admin@example.com", recoveryToken, newPassword });
  assert.equal(await harness.service.authenticate(first.sessionToken), null);
  assert.equal(await harness.service.authenticate(second.sessionToken), null);
  await assert.rejects(
    harness.service.recover({ email: "admin@example.com", recoveryToken, newPassword: anotherStrongPassword }),
    (error: unknown) => error instanceof AdminAuthError && error.code === "token_consumed"
  );
});

test("expired sessions do not authenticate", async () => {
  const harness = await createInitializedHarness();
  const login = await harness.service.login({ email: "admin@example.com", password: strongPassword, rateLimitKey: "expiry" });
  harness.clock.advance(7 * 24 * 60 * 60 * 1000 + 1);
  assert.equal(await harness.service.authenticate(login.sessionToken), null);
});
```

In the actual test file, implement `createMemoryAdminStore()` with Maps for users, sessions, controls, and attempts; expose read-only inspection methods so tests can assert no plaintext secret was persisted.

- [ ] **Step 2: Run and verify failure**

Run: `node --test netlify/functions/_shared/admin-auth-service.test.ts`

Expected: FAIL because store and service modules are missing.

- [ ] **Step 3: Define records and store contract**

```ts
export type AdminUser = {
  id: string;
  email: string;
  emailNormalized: string;
  role: "admin";
  passwordHash: string;
  passwordSalt: string;
  passwordAlgorithm: "scrypt";
  createdAt: string;
  updatedAt: string;
  active: boolean;
};

export type AdminSession = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

export interface AdminStore {
  getUserByEmail(emailNormalized: string): Promise<AdminUser | null>;
  getOnlyUser(): Promise<AdminUser | null>;
  createUserOnce(user: AdminUser): Promise<boolean>;
  getControl(key: string): Promise<Record<string, unknown> | null>;
  setControlOnce(key: string, value: Record<string, unknown>): Promise<boolean>;
  setControl(key: string, value: Record<string, unknown>): Promise<void>;
  getSession(tokenHash: string): Promise<AdminSession | null>;
  setSession(session: AdminSession): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  getAttempt(key: string): Promise<LoginAttempt | null>;
  setAttempt(key: string, attempt: LoginAttempt): Promise<void>;
  deleteAttempt(key: string): Promise<void>;
  updateUser(user: AdminUser): Promise<void>;
}
```

The Blob implementation uses `getStore({ consistency: "strong", name: "yyq-site-admin" })`. Use `onlyIfNew: true` for the first user and setup-lock records. Store sessions under `sessions/<sha256-token>` and scan only that bounded prefix when invalidating the single administrator's sessions.

- [ ] **Step 4: Implement the auth service**

```ts
export type AdminAuthService = {
  setup(input: SetupInput): Promise<{ user: PublicAdminUser; sessionToken: string }>;
  login(input: LoginInput & { rateLimitKey: string }): Promise<{ user: PublicAdminUser; sessionToken: string }>;
  authenticate(sessionToken: string | undefined): Promise<PublicAdminUser | null>;
  logout(sessionToken: string | undefined): Promise<void>;
  recover(input: RecoverInput): Promise<{ user: PublicAdminUser }>;
};
```

Use generic `invalid_credentials` for missing users and wrong passwords. Compare setup/recovery tokens by digest, store consumed fingerprints, apply a five-failure/15-minute window, and inject `now()` plus environment reads so tests are deterministic.

- [ ] **Step 5: Run service and full tests**

Run: `node --test netlify/functions/_shared/admin-auth-service.test.ts`

Expected: PASS.

Add the test to `test:rag`, then run `npm test`.

- [ ] **Step 6: Commit auth storage and service**

```powershell
git add netlify/functions/_shared/admin-store.ts netlify/functions/_shared/admin-auth-service.ts netlify/functions/_shared/admin-auth-service.test.ts package.json
git commit -m "feat: add admin auth service"
```

---

### Task 4: Administrator Auth HTTP Function

**Files:**
- Create: `netlify/functions/admin-auth.ts`
- Create: `netlify/functions/_shared/admin-auth-http.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: `createBlobAdminStore`, `createAdminAuthService`, security body/origin/cookie helpers.
- Produces: Netlify handler for `GET|POST|OPTIONS /api/admin/auth?action=...` and reusable `authenticateAdminRequest(req)` for protected functions.

- [ ] **Step 1: Write HTTP contract tests against an injected handler**

Test setup/login/me/logout/recover, missing origin, bad JSON, wrong method, `Set-Cookie`, no secret fields, 401, 409, 422, and 429. Use a `createAdminAuthHandler({ service, now })` factory so tests never touch live Blobs.

```ts
const loginRequest = new Request("https://yyq-web.netlify.app/api/admin/auth?action=login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://yyq-web.netlify.app" },
  body: JSON.stringify({ email: "admin@example.com", password: strongPassword })
});
const response = await handler(loginRequest, context);
assert.equal(response.status, 200);
assert.match(response.headers.get("Set-Cookie") ?? "", /yyq_admin_session=/);
assert.doesNotMatch(await response.text(), /password|tokenHash|passwordHash/);
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test netlify/functions/_shared/admin-auth-http.test.ts`

Expected: FAIL because `admin-auth.ts` is missing.

- [ ] **Step 3: Implement strict action routing**

Map errors exactly:

```text
invalid_credentials -> 401
unauthorized -> 401
rate_limited -> 429
setup_closed -> 409
token_consumed -> 409
invalid_input -> 422
missing_configuration -> 503
unsupported_media_type -> 415
body_too_large -> 413
```

`GET action=me` reads the Cookie and returns `{ user }` or 401. `POST action=logout` clears both server session and Cookie. Setup/login set the Cookie. Recovery clears the Cookie so the administrator must log in with the new password.

Export:

```ts
export async function authenticateAdminRequest(req: Request): Promise<PublicAdminUser | null>;
export const config = { method: ["GET", "POST", "OPTIONS"], path: "/api/admin/auth" };
```

- [ ] **Step 4: Run focused, function typecheck, and full tests**

Run: `node --test netlify/functions/_shared/admin-auth-http.test.ts`

Run: `npm run typecheck:functions`

Add the test to `test:rag`, then run `npm test`.

Expected: all commands PASS.

- [ ] **Step 5: Commit the auth endpoint**

```powershell
git add netlify/functions/admin-auth.ts netlify/functions/_shared/admin-auth-http.test.ts package.json
git commit -m "feat: expose admin authentication api"
```

---

### Task 5: Versioned Site Content Store

**Files:**
- Create: `netlify/functions/_shared/site-content-store.ts`
- Create: `netlify/functions/_shared/site-content-store.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: shared schema/defaults and `@netlify/blobs` `getWithMetadata`, `setJSON`, `onlyIfNew`, `onlyIfMatch`.
- Produces: `SiteContentStore` with `getCurrent`, `save`, `listRevisions`, and `restore`.

- [ ] **Step 1: Write failing store tests**

Cover empty-store fallback, first write, conditional update, stale version conflict, revision creation, restore-as-new-version, and 20-record retention:

```ts
test("save uses expectedVersion and creates a revision", async () => {
  const store = createTestContentStore(defaultSiteContent);
  const sections = structuredClone(defaultSiteContent.sections);
  sections.home.titleLines = ["新的标题"];
  const saved = await store.save({ expectedVersion: defaultSiteContent.version, sections }, actor);
  assert.equal(saved.document.sections.home.titleLines[0], "新的标题");
  assert.equal((await store.listRevisions()).length, 1);
});

test("stale writes return a content conflict", async () => {
  await assert.rejects(
    store.save({ expectedVersion: "stale-version", sections: defaultSiteContent.sections }, actor),
    (error: unknown) => error instanceof SiteContentStoreError && error.code === "content_conflict"
  );
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test netlify/functions/_shared/site-content-store.test.ts`

Expected: FAIL because the store module is missing.

- [ ] **Step 3: Implement conditional Blob writes**

Define:

```ts
export type RevisionSummary = {
  id: string;
  createdAt: string;
  actorEmail: string;
  sourceVersion: string;
  reason: "save" | "restore";
};

export interface SiteContentStore {
  getCurrent(): Promise<SiteContentDocument>;
  save(update: SiteContentUpdate, actor: PublicAdminUser): Promise<{ document: SiteContentDocument; revision: RevisionSummary }>;
  listRevisions(): Promise<RevisionSummary[]>;
  restore(revisionId: string, expectedVersion: string, actor: PublicAdminUser): Promise<SiteContentDocument>;
}
```

Read `current` with `getWithMetadata(..., { type: "json" })`. If missing, treat `defaultSiteContent` as current and create with `onlyIfNew: true`; otherwise write with `onlyIfMatch: current.etag`. Convert a failed precondition into `content_conflict`. Store full snapshots under lexically sortable `revisions/<ISO timestamp>-<UUID>` keys and delete only entries older than the newest 20 after a successful write.

- [ ] **Step 4: Run tests and register them**

Run: `node --test netlify/functions/_shared/site-content-store.test.ts`

Expected: PASS.

Add the test to `test:rag`; run `npm test` and `npm run typecheck:functions`.

- [ ] **Step 5: Commit the versioned store**

```powershell
git add netlify/functions/_shared/site-content-store.ts netlify/functions/_shared/site-content-store.test.ts package.json
git commit -m "feat: store versioned site content"
```

---

### Task 6: Public and Protected Content HTTP APIs

**Files:**
- Create: `netlify/functions/site-content.ts`
- Create: `netlify/functions/_shared/site-content-http.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: `SiteContentStore`, shared parsers, `authenticateAdminRequest`, and existing CORS helpers.
- Produces: `/api/site-content`, `/api/admin/content`, and `/api/admin/revisions` handlers.

- [ ] **Step 1: Write failing API tests**

Test these exact contracts:

```text
GET /api/site-content -> 200 public document, no account fields
GET /api/site-content from https://mrxiaoxies.github.io -> exact Access-Control-Allow-Origin
PUT /api/admin/content without session -> 401
PUT /api/admin/content with unknown field -> 422
PUT /api/admin/content with valid session -> 200 and new version
PUT stale expectedVersion -> 409 and code content_conflict
GET /api/admin/revisions with session -> 200 summaries
POST /api/admin/content?action=restore -> 200 restored-as-new document
```

Inject both `contentStore` and `authenticate` into `createSiteContentHandler(deps)`.

- [ ] **Step 2: Run and verify failure**

Run: `node --test netlify/functions/_shared/site-content-http.test.ts`

Expected: FAIL because `site-content.ts` is missing.

- [ ] **Step 3: Implement route and CORS behavior**

Export one default handler with code-level paths:

```ts
export const config = {
  method: ["GET", "PUT", "POST", "OPTIONS"],
  path: ["/api/site-content", "/api/admin/content", "/api/admin/revisions"]
};
```

Public GET uses exact allowed origin resolution and `Cache-Control: no-store`. Admin routes require same-origin validation plus a valid session. Return normalized JSON errors `{ error: { code, message } }`; never serialize internal exception messages.

- [ ] **Step 4: Run focused and full verification**

Run: `node --test netlify/functions/_shared/site-content-http.test.ts`

Add the test to `test:rag`; run `npm test` and `npm run typecheck:functions`.

Expected: all PASS.

- [ ] **Step 5: Commit content APIs**

```powershell
git add netlify/functions/site-content.ts netlify/functions/_shared/site-content-http.test.ts package.json
git commit -m "feat: expose site content api"
```

---

### Task 7: Protect Existing Analytics with Administrator Sessions

**Files:**
- Modify: `netlify/functions/analytics.ts:1-239`
- Create: `netlify/functions/_shared/analytics-auth.test.ts`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: `authenticateAdminRequest(req)` from Task 4.
- Produces: unchanged public `POST /api/visit`; session-protected `GET /api/stats`.

- [ ] **Step 1: Write analytics regression tests**

Refactor the function to export `createAnalyticsHandler({ authenticate, getAnalyticsStore })` for tests, then assert:

```ts
test("stats rejects visitors without an admin session", async () => {
  const response = await handler(new Request("https://yyq-web.netlify.app/api/stats"), context);
  assert.equal(response.status, 401);
});

test("stats no longer accepts x-admin-token", async () => {
  const response = await handler(new Request("https://yyq-web.netlify.app/api/stats", {
    headers: { "x-admin-token": "legacy-token" }
  }), context);
  assert.equal(response.status, 401);
});

test("visit remains public and stores sanitized fields", async () => {
  const response = await handler(new Request("https://yyq-web.netlify.app/api/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://yyq-web.netlify.app" },
    body: JSON.stringify({
      event: "pageview",
      page: "/<script>alert(1)</script>",
      referrer: "https://example.com/".repeat(30),
      sessionId: "session-1!!",
      userAgent: "test-agent",
      visitorId: "visitor-1!!"
    })
  }), context);
  assert.equal(response.status, 200);
  const session = await analyticsStore.getJSON("sessions/session-1");
  assert.equal(session.sessionId, "session-1");
  assert.ok(session.page.length <= 180);
  assert.ok(session.referrer.length <= 220);
});
```

- [ ] **Step 2: Run and verify failure against current behavior**

Run: `node --test netlify/functions/_shared/analytics-auth.test.ts`

Expected: FAIL because the current function still uses `VISITOR_ADMIN_TOKEN` and does not expose an injectable handler.

- [ ] **Step 3: Replace legacy token authorization**

Remove `getAdminToken`, `x-admin-token` from allowed headers, and submitted-token comparison. Call `authenticate(req)` before `collectStats`; return 401 when it yields null. Keep `/api/visit` request cleaning, strong-consistency store, online window, and retention behavior unchanged.

For public visit CORS, allow Netlify, GitHub Pages, and configured public origins exactly; do not return `Access-Control-Allow-Origin: *`.

- [ ] **Step 4: Run focused, full, and type checks**

Run: `node --test netlify/functions/_shared/analytics-auth.test.ts`

Add the test to `test:rag`; run `npm test` and `npm run typecheck:functions`.

Expected: all PASS.

- [ ] **Step 5: Commit analytics migration**

```powershell
git add netlify/functions/analytics.ts netlify/functions/_shared/analytics-auth.test.ts package.json
git commit -m "feat: protect analytics with admin sessions"
```

---

### Task 8: Load Published Content in the Public React Site

**Files:**
- Create: `src/lib/site-content-client.ts`
- Create: `src/lib/site-content-client.test.ts`
- Create: `src/hooks/use-site-content.ts`
- Modify: `src/App.tsx:84-499,1220-1328,1329-1503,1513-2010`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: shared schema and `defaultSiteContent` from Task 1.
- Produces: `resolveSiteContentApiBase(location)`, `fetchSiteContent(fetchImpl, location)`, `useSiteContent()`, and content-driven `App` rendering.

- [ ] **Step 1: Write failing client tests**

```ts
test("GitHub Pages reads public content from Netlify", () => {
  assert.equal(
    resolveSiteContentApiBase(new URL("https://mrxiaoxies.github.io/YYQ-Personal-web/")),
    "https://yyq-web.netlify.app"
  );
});

test("Netlify uses same-origin content api", () => {
  assert.equal(resolveSiteContentApiBase(new URL("https://yyq-web.netlify.app/")), "");
});

test("fetch falls back to built-in content on network or schema failure", async () => {
  const result = await fetchSiteContent(async () => new Response("bad", { status: 503 }), netlifyUrl);
  assert.equal(result.source, "fallback");
  assert.equal(result.document.version, defaultSiteContent.version);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test src/lib/site-content-client.test.ts`

Expected: FAIL because the client module is missing.

- [ ] **Step 3: Implement endpoint resolution and hook**

Resolution order:

1. `VITE_SITE_CONTENT_API_BASE` when explicitly configured;
2. `https://yyq-web.netlify.app` for `*.github.io`;
3. empty base for same-origin Netlify/production;
4. empty base in Vite local development, where a failed Function request falls back silently.

`fetchSiteContent` must request `${base}/api/site-content`, parse with `parseSiteContentDocument`, and return `{ document, source: "remote" | "fallback" }`. `useSiteContent` starts with `defaultSiteContent`, fetches once, ignores state updates after unmount, and exposes `setDocument` so a successful admin save can update the current page without reload.

- [ ] **Step 4: Migrate `App.tsx` to content props**

- Delete the local `codexProjects`, `skillGroups`, and `resumeCompanies` constants after replacing every consumer.
- Pass `content.sections.codex.projects` into `ProjectTimelinePage`.
- Pass `content.sections.contact` into `ContactModal`.
- Replace Home, Showcase, Skills, Resume, Contact, and Codex heading literals with the matching content fields.
- Keep all layout, animation, assets, section IDs, button targets, download behavior, and QR image behavior unchanged.
- Use stable `id` fields for React keys instead of mutable titles.

- [ ] **Step 5: Run client tests, app typecheck, and build**

Run: `node --test src/lib/site-content-client.test.ts`

Add the test to `test:rag`; run `npm test`, `npm run typecheck:app`, and `npm run build`.

Expected: all PASS and Vite emits `dist/` without new warnings.

- [ ] **Step 6: Commit public dynamic content**

```powershell
git add src/lib/site-content-client.ts src/lib/site-content-client.test.ts src/hooks/use-site-content.ts src/App.tsx package.json
git commit -m "feat: render published site content"
```

---

### Task 9: Administrator API Client and Management Interface

**Files:**
- Create: `src/lib/admin-api.ts`
- Create: `src/lib/admin-api.test.ts`
- Create: `src/components/admin/AdminApp.tsx`
- Create: `src/components/admin/AdminAuthView.tsx`
- Create: `src/components/admin/AdminHome.tsx`
- Create: `src/components/admin/AdminSectionEditor.tsx`
- Create: `src/components/admin/section-editors.tsx`
- Modify: `src/App.tsx:84-180,1062-1219,1504-1760`
- Modify: `src/index.css`
- Modify: `package.json:12-18`

**Interfaces:**
- Consumes: shared content types, `setDocument` from Task 8, auth/content/stats endpoints from Tasks 4, 6, and 7.
- Produces: credentialed admin client and complete `#admin` UI.

- [ ] **Step 1: Write failing admin client tests**

Test that every admin request uses `credentials: "include"`, mutating requests send JSON, 401 maps to `AdminApiError("unauthorized")`, 409 maps to `AdminApiError("content_conflict")`, and Pages resolves `VITE_ADMIN_SITE_URL`/Netlify URL instead of attempting login.

```ts
test("saveContent sends the current expected version with credentials", async () => {
  const calls: RequestInit[] = [];
  await saveContent(update, async (_url, init) => {
    calls.push(init ?? {});
    return Response.json(savedDocument);
  });
  assert.equal(calls[0].credentials, "include");
  assert.equal(calls[0].method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0].body)), update);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test src/lib/admin-api.test.ts`

Expected: FAIL because `admin-api.ts` is missing.

- [ ] **Step 3: Implement the API client**

Export:

```ts
export type PublicAdminUser = { id: string; email: string; role: "admin" };
export type RecentVisitor = {
  city?: string;
  country?: string;
  lastSeenAt: string;
  page: string;
  pageViews: number;
  referrer: string;
  sessionId: string;
  userAgent: string;
};
export type AnalyticsStats = {
  generatedAt: string;
  lastVisitAt: string | null;
  onlineCount: number;
  onlineWindowSeconds: number;
  recentVisitors: RecentVisitor[];
  todayVisits: number;
  totalVisitors: number;
  totalVisits: number;
};
export type RevisionSummary = {
  id: string;
  createdAt: string;
  actorEmail: string;
  sourceVersion: string;
  reason: "save" | "restore";
};
export class AdminApiError extends Error { constructor(public code: string, public status: number, message: string); }
export function getCurrentAdmin(): Promise<PublicAdminUser>;
export function loginAdmin(input: LoginInput): Promise<PublicAdminUser>;
export function setupAdmin(input: SetupInput): Promise<PublicAdminUser>;
export function recoverAdmin(input: RecoverInput): Promise<void>;
export function logoutAdmin(): Promise<void>;
export function loadAdminStats(): Promise<AnalyticsStats>;
export function saveContent(update: SiteContentUpdate): Promise<SiteContentDocument>;
export function loadRevisions(): Promise<RevisionSummary[]>;
export function restoreRevision(input: { revisionId: string; expectedVersion: string }): Promise<SiteContentDocument>;
```

All functions use a shared request helper that parses normalized JSON errors and never persists credentials or tokens in `localStorage`/`sessionStorage`.

- [ ] **Step 4: Build the auth and orchestration views**

`AdminApp` state is:

```ts
type AdminScreen =
  | { name: "loading" }
  | { name: "auth"; mode: "login" | "setup" | "recover" }
  | { name: "home" }
  | { name: "edit"; section: keyof SiteContentSections };
```

On mount, Pages displays a Netlify management link; Netlify calls `getCurrentAdmin`. A 401 opens login. Login/setup success loads current content, stats, and revisions. Logout clears server state and returns to login. A 401 from any later call also returns to login.

`AdminAuthView` must have visible labels, password autocomplete values (`current-password` or `new-password`), disabled submit state, generic errors, and no token in URL parameters.

- [ ] **Step 5: Build dashboard and six typed editors**

`AdminHome` retains the current metric cards and recent visitor table, then adds six section cards and the latest revision list. Poll stats every 10 seconds only while authenticated and visible.

`AdminSectionEditor` clones the current `sections`, passes one section to the matching form, and submits the complete `SiteContentUpdate`. On success it calls `onPublished(document)` and displays the new timestamp. On 409 it preserves form state and offers “重新载入最新内容”.

`section-editors.tsx` implements:

- Home text/title-line fields;
- Codex project/milestone/link/timeline list fields;
- Showcase heading/card/tag/download fields;
- Skills group/item list fields;
- Resume company/project/point list fields;
- Contact text and contact-detail fields.

New items receive `crypto.randomUUID()` IDs. Up/down controls reorder arrays; delete and revision restore require `window.confirm`. Raw HTML editing and file inputs are absent.

- [ ] **Step 6: Replace the old analytics token view**

Delete `AnalyticsDashboard`, `yyq-admin-token`, `tokenInput`, and `x-admin-token` code from `App.tsx`. Mount:

```tsx
{isAdminView ? (
  <AdminApp content={siteContent} onPublished={setSiteContent} />
) : isProjectTimelineView ? (
  <ProjectTimelinePage projects={siteContent.sections.codex.projects} />
) : (
  <PublicSite content={siteContent} />
)}
```

Keep the existing public-site JSX in `App.tsx`. Extract only the administrator components listed in this task; do not perform unrelated seasonal or contact-modal refactors.

- [ ] **Step 7: Add focused responsive/admin styles**

Add named classes only for layout not expressible clearly with existing utilities: admin shell width, sticky section navigation, status banner, list-row controls, and narrow-screen stacking. Preserve existing global colors and glass styles. Verify focus rings and error text contrast.

- [ ] **Step 8: Run client tests and all static verification**

Run: `node --test src/lib/admin-api.test.ts`

Add the test to `test:rag`; run `npm test`, `npm run typecheck`, and `npm run build`.

Expected: all PASS.

- [ ] **Step 9: Start local Vite and perform fallback UI smoke checks**

Run: `npm run dev`

Expected local behavior:

- `/` renders built-in content when Functions return 404;
- `/#admin` renders the login shell and a clear local/Netlify service message;
- `/#projects` renders the content-driven timeline;
- mobile width keeps admin forms inside the viewport;
- browser console has no uncaught exceptions.

- [ ] **Step 10: Commit the management interface**

```powershell
git add src/lib/admin-api.ts src/lib/admin-api.test.ts src/components/admin/AdminApp.tsx src/components/admin/AdminAuthView.tsx src/components/admin/AdminHome.tsx src/components/admin/AdminSectionEditor.tsx src/components/admin/section-editors.tsx src/App.tsx src/index.css package.json
git commit -m "feat: add personal site admin ui"
```

---

### Task 10: Documentation, Versioning, Full Verification, and Draft Deploy

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION`
- Modify: `package.json:4`
- Modify: `package-lock.json:3,9`

**Interfaces:**
- Consumes: completed admin/content implementation and all prior test commands.
- Produces: operator runbook, `0.4.0` release metadata, verified Netlify Draft URL.

- [ ] **Step 1: Document exact environment variables**

Add non-secret examples:

```text
ADMIN_SETUP_TOKEN=replace-with-at-least-32-random-characters
ADMIN_RECOVERY_TOKEN=replace-with-a-new-at-least-32-character-token
ADMIN_ALLOWED_ORIGINS=http://localhost:8888,http://127.0.0.1:8888
PUBLIC_SITE_ALLOWED_ORIGINS=https://mrxiaoxies.github.io
VITE_ADMIN_SITE_URL=https://yyq-web.netlify.app/#admin
VITE_SITE_CONTENT_API_BASE=https://yyq-web.netlify.app
```

State that `ADMIN_SETUP_TOKEN` and `ADMIN_RECOVERY_TOKEN` are server-only and must never use a `VITE_` prefix.

- [ ] **Step 2: Add the operator runbook**

Document these exact procedures in `docs/OPERATIONS.md`:

1. Generate a 32-byte base64url setup token locally without printing unrelated environment variables.
2. Set `ADMIN_SETUP_TOKEN` in Netlify.
3. Create a Draft Deploy and open `/#admin`.
4. Initialize the single account and confirm the second setup is rejected.
5. Remove or rotate the setup token after initialization.
6. For recovery, set a new `ADMIN_RECOVERY_TOKEN`, reset once, verify reuse fails, then remove/rotate it.
7. Explain that Blob content is dynamic and not committed to Git.
8. Explain that GitHub Pages loads public content from Netlify but sends admin login to Netlify.
9. Explain revision restore and the 20-revision retention limit.
10. State that Vite-only local preview cannot validate real Blobs/cookies; use a Netlify Draft Deploy for final auth verification.

- [ ] **Step 3: Update README and release metadata**

- Set `package.json`, top-level `package-lock.json`, and `VERSION` to `0.4.0`.
- Add `## [0.4.0] - 2026-08-26` to `CHANGELOG.md` with Added/Changed/Security bullets.
- Update README repository map and admin/content behavior without exposing operational secrets.
- Keep `.env.example` values as visibly non-production examples only.

- [ ] **Step 4: Run the complete local gate**

Run in order:

```powershell
npm test
npm run typecheck
npm run build
git -c safe.directory='D:/oper AI/个人网站' diff --check
rg -n '"version": "0\.4\.0"' package.json package-lock.json
Get-Content -LiteralPath VERSION
rg -n '^## \[0\.4\.0\] - 2026-08-26' CHANGELOG.md
git -c safe.directory='D:/oper AI/个人网站' status --short
```

Expected:

- all tests pass;
- both app and Function typechecks pass;
- Vite build succeeds;
- diff check is empty;
- all three version files report `0.4.0`;
- only intended source, test, config, and documentation files are modified.

- [ ] **Step 5: Commit release metadata and documentation**

```powershell
git add .env.example README.md docs/OPERATIONS.md CHANGELOG.md VERSION package.json package-lock.json
git commit -m "docs: document admin operations"
```

- [ ] **Step 6: Create and verify a Netlify Draft Deploy**

Run:

```powershell
npm run deploy:preview
```

On the returned Draft URL verify:

- `GET /api/site-content` returns schema v1 content;
- first setup succeeds once;
- login sets an HttpOnly session Cookie;
- `GET /api/stats` returns 200 only after login;
- each of the six editor forms loads;
- change a harmless test title, save, refresh public page, and observe the update;
- restore the prior revision and observe the original title;
- stale version submission returns 409;
- recovery succeeds once, clears old sessions, and rejects token reuse;
- logout makes protected API requests return 401;
- GitHub Pages origin receives the exact public-content CORS header;
- no response or log contains password, setup token, recovery token, raw session token, or password hash.

Restore the original content before reporting the Draft as verified.

- [ ] **Step 7: Run final repository review**

```powershell
git -c safe.directory='D:/oper AI/个人网站' status --short --branch
git -c safe.directory='D:/oper AI/个人网站' diff --stat origin/main...HEAD
git -c safe.directory='D:/oper AI/个人网站' log --oneline origin/main..HEAD
```

Expected: the branch contains the design, plan, implementation, tests, and release documentation; no generated or secret files are staged.

- [ ] **Step 8: Stop before production publication**

Report the verified Draft URL and checks. Do not push `main`, deploy Production, or publish `gh-pages` until the user explicitly authorizes release/publication.
