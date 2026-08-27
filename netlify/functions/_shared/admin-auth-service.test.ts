import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AdminAuthError,
  createAdminAuthService,
  type AdminAuthService
} from "./admin-auth-service.ts";
import { hashPassword, hashSecret } from "./admin-security.ts";
import {
  createBlobAdminStore,
  type AdminSession,
  type AdminStore,
  type AdminUser,
  type LoginAttempt
} from "./admin-store.ts";

const SETUP_TOKEN = "setup-token-that-is-at-least-32-characters";
const RECOVERY_TOKEN = "recovery-token-that-is-at-least-32-chars";
const STRONG_PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "new correct horse battery staple";
const ANOTHER_STRONG_PASSWORD = "another correct horse battery staple";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type MemoryAdminStore = AdminStore & {
  inspectAttempts(): ReadonlyMap<string, LoginAttempt>;
  inspectControls(): ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  inspectSessions(): ReadonlyMap<string, AdminSession>;
  inspectUsers(): readonly AdminUser[];
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createMemoryAdminStore(): MemoryAdminStore {
  const users = new Map<string, AdminUser>();
  const sessions = new Map<string, AdminSession>();
  const controls = new Map<string, Record<string, unknown>>();
  const attempts = new Map<string, LoginAttempt>();

  return {
    async getUserByEmail(emailNormalized) {
      const user = [...users.values()].find((candidate) => candidate.emailNormalized === emailNormalized);
      return user ? clone(user) : null;
    },
    async getOnlyUser() {
      const user = users.values().next().value as AdminUser | undefined;
      return user ? clone(user) : null;
    },
    async createUserOnce(user) {
      if (users.size > 0) return false;
      users.set(user.id, clone(user));
      return true;
    },
    async getControl(key) {
      const value = controls.get(key);
      return value ? clone(value) : null;
    },
    async setControlOnce(key, value) {
      if (controls.has(key)) return false;
      controls.set(key, clone(value));
      return true;
    },
    async setControl(key, value) {
      controls.set(key, clone(value));
    },
    async getSession(tokenHash) {
      const session = sessions.get(tokenHash);
      return session ? clone(session) : null;
    },
    async setSession(session) {
      sessions.set(session.tokenHash, clone(session));
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteSessionsForUser(userId) {
      for (const [tokenHash, session] of sessions) {
        if (session.userId === userId) sessions.delete(tokenHash);
      }
    },
    async getAttempt(key) {
      const attempt = attempts.get(key);
      return attempt ? clone(attempt) : null;
    },
    async setAttempt(key, attempt) {
      attempts.set(key, clone(attempt));
    },
    async deleteAttempt(key) {
      attempts.delete(key);
    },
    async updateUser(user) {
      if (!users.has(user.id)) throw new Error("Cannot update a missing administrator.");
      users.set(user.id, clone(user));
    },
    inspectUsers: () => Object.freeze([...users.values()].map((user) => Object.freeze(clone(user)))),
    inspectSessions: () => new Map([...sessions].map(([key, value]) => [key, Object.freeze(clone(value))])),
    inspectControls: () => new Map([...controls].map(([key, value]) => [key, Object.freeze(clone(value))])),
    inspectAttempts: () => new Map([...attempts].map(([key, value]) => [key, Object.freeze(clone(value))]))
  };
}

function createClock(initial = "2026-08-26T10:00:00.000Z") {
  let currentMs = new Date(initial).getTime();
  return {
    advance(milliseconds: number) {
      currentMs += milliseconds;
    },
    now: () => new Date(currentMs)
  };
}

function createTestService(options: {
  setupToken?: string;
  recoveryToken?: string;
  store?: MemoryAdminStore;
  clock?: ReturnType<typeof createClock>;
} = {}) {
  const store = options.store ?? createMemoryAdminStore();
  const clock = options.clock ?? createClock();
  const environment = new Map<string, string>();
  if (options.setupToken !== undefined) environment.set("ADMIN_SETUP_TOKEN", options.setupToken);
  if (options.recoveryToken !== undefined) environment.set("ADMIN_RECOVERY_TOKEN", options.recoveryToken);

  const service = createAdminAuthService({
    store,
    now: clock.now,
    readEnvironment: (name) => environment.get(name)
  });

  return { clock, environment, service, store };
}

async function createInitializedHarness(): Promise<{
  clock: ReturnType<typeof createClock>;
  environment: Map<string, string>;
  service: AdminAuthService;
  store: MemoryAdminStore;
}> {
  const harness = createTestService({ setupToken: SETUP_TOKEN, recoveryToken: RECOVERY_TOKEN });
  await harness.service.setup({
    email: "ADMIN@example.com",
    password: STRONG_PASSWORD,
    setupToken: SETUP_TOKEN
  });
  return harness;
}

async function expectAuthError(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof AdminAuthError);
    assert.equal(error.code, code);
    return true;
  });
}

test("setup succeeds once and permanently consumes the setup token", async () => {
  const harness = createTestService({ setupToken: SETUP_TOKEN });
  const first = await harness.service.setup({
    email: "ADMIN@example.com",
    password: STRONG_PASSWORD,
    setupToken: SETUP_TOKEN
  });

  assert.equal(first.user.email, "admin@example.com");
  assert.equal(first.user.role, "admin");
  await expectAuthError(
    () =>
      harness.service.setup({
        email: "second@example.com",
        password: STRONG_PASSWORD,
        setupToken: SETUP_TOKEN
      }),
    "setup_closed"
  );
});

test("concurrent setup permits exactly one administrator", async () => {
  const harness = createTestService({ setupToken: SETUP_TOKEN });
  const results = await Promise.allSettled([
    harness.service.setup({ email: "first@example.com", password: STRONG_PASSWORD, setupToken: SETUP_TOKEN }),
    harness.service.setup({ email: "second@example.com", password: STRONG_PASSWORD, setupToken: SETUP_TOKEN })
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.ok(rejected?.reason instanceof AdminAuthError);
  assert.equal(rejected.reason.code, "setup_closed");
  assert.equal(harness.store.inspectUsers().length, 1);
  assert.equal(harness.store.inspectControls().size, 1);
});

test("login creates a hashed seven-day session and uses generic credential failures", async () => {
  const harness = await createInitializedHarness();
  const result = await harness.service.login({
    email: "ADMIN@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "admin@example.com|203.0.113.10"
  });
  const stored = await harness.store.getSession(hashSecret(result.sessionToken));

  assert.ok(stored);
  assert.equal(stored.tokenHash, hashSecret(result.sessionToken));
  assert.notEqual(stored.tokenHash, result.sessionToken);
  assert.equal(new Date(stored.expiresAt).getTime() - harness.clock.now().getTime(), SEVEN_DAYS_MS);
  await expectAuthError(
    () =>
      harness.service.login({
        email: "missing@example.com",
        password: STRONG_PASSWORD,
        rateLimitKey: "missing|ip"
      }),
    "invalid_credentials"
  );
  await expectAuthError(
    () =>
      harness.service.login({
        email: "admin@example.com",
        password: "wrong-password-value",
        rateLimitKey: "wrong|ip"
      }),
    "invalid_credentials"
  );
});

test("five failed attempts in fifteen minutes lock the sixth attempt", async () => {
  const harness = await createInitializedHarness();
  const input = {
    email: "admin@example.com",
    password: "wrong-password-value",
    rateLimitKey: "admin@example.com|203.0.113.10"
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expectAuthError(() => harness.service.login(input), "invalid_credentials");
  }
  await expectAuthError(
    () => harness.service.login({ ...input, password: STRONG_PASSWORD }),
    "rate_limited"
  );
});

test("the login limit expires at exactly fifteen minutes", async () => {
  const harness = await createInitializedHarness();
  const rateLimitKey = "admin@example.com|198.51.100.20";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expectAuthError(
      () =>
        harness.service.login({
          email: "admin@example.com",
          password: "wrong-password-value",
          rateLimitKey
        }),
      "invalid_credentials"
    );
  }

  harness.clock.advance(FIFTEEN_MINUTES_MS);
  const login = await harness.service.login({ email: "admin@example.com", password: STRONG_PASSWORD, rateLimitKey });
  assert.equal(login.user.email, "admin@example.com");
});

test("a successful login clears the failed-attempt window", async () => {
  const harness = await createInitializedHarness();
  const rateLimitKey = "admin@example.com|192.0.2.50";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await expectAuthError(
      () =>
        harness.service.login({
          email: "admin@example.com",
          password: "wrong-password-value",
          rateLimitKey
        }),
      "invalid_credentials"
    );
  }

  await harness.service.login({ email: "admin@example.com", password: STRONG_PASSWORD, rateLimitKey });
  assert.equal(harness.store.inspectAttempts().has(rateLimitKey), false);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await expectAuthError(
      () =>
        harness.service.login({
          email: "admin@example.com",
          password: "wrong-password-value",
          rateLimitKey
        }),
      "invalid_credentials"
    );
  }
});

test("inactive users cannot log in or authenticate an existing session", async () => {
  const harness = await createInitializedHarness();
  const login = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "inactive-session"
  });
  const user = harness.store.inspectUsers()[0];
  assert.ok(user);
  await harness.store.updateUser({ ...user, active: false, updatedAt: harness.clock.now().toISOString() });

  assert.equal(await harness.service.authenticate(login.sessionToken), null);
  await expectAuthError(
    () =>
      harness.service.login({
        email: "admin@example.com",
        password: STRONG_PASSWORD,
        rateLimitKey: "inactive-login"
      }),
    "invalid_credentials"
  );
});

test("recovery token is one-time and clears every previous session", async () => {
  const harness = await createInitializedHarness();
  const first = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "first"
  });
  const second = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "second"
  });

  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  assert.equal(await harness.service.authenticate(first.sessionToken), null);
  assert.equal(await harness.service.authenticate(second.sessionToken), null);
  await expectAuthError(
    () =>
      harness.service.recover({
        email: "admin@example.com",
        recoveryToken: RECOVERY_TOKEN,
        newPassword: ANOTHER_STRONG_PASSWORD
      }),
    "token_consumed"
  );
  const login = await harness.service.login({
    email: "admin@example.com",
    password: NEW_PASSWORD,
    rateLimitKey: "after-recovery"
  });
  assert.equal(login.user.email, "admin@example.com");
});

test("an incorrect recovery token does not consume the configured token", async () => {
  const harness = await createInitializedHarness();
  await expectAuthError(
    () =>
      harness.service.recover({
        email: "admin@example.com",
        recoveryToken: "wrong-recovery-token-that-is-long-enough",
        newPassword: NEW_PASSWORD
      }),
    "invalid_recovery_token"
  );

  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  assert.equal(harness.store.inspectControls().size, 2);
});

test("expired sessions do not authenticate", async () => {
  const harness = await createInitializedHarness();
  const login = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "expiry"
  });

  harness.clock.advance(SEVEN_DAYS_MS + 1);
  assert.equal(await harness.service.authenticate(login.sessionToken), null);
  assert.equal(await harness.store.getSession(hashSecret(login.sessionToken)), null);
});

test("logout is idempotent and invalidates only the presented session", async () => {
  const harness = await createInitializedHarness();
  const first = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "logout-first"
  });
  const second = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "logout-second"
  });

  await harness.service.logout(first.sessionToken);
  await harness.service.logout(first.sessionToken);
  await harness.service.logout(undefined);
  assert.equal(await harness.service.authenticate(first.sessionToken), null);
  assert.equal((await harness.service.authenticate(second.sessionToken))?.email, "admin@example.com");
});

test("no plaintext password, setup, recovery, or session token is persisted", async () => {
  const harness = await createInitializedHarness();
  const login = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "secret-inspection"
  });
  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });

  const persisted = JSON.stringify({
    attempts: [...harness.store.inspectAttempts()],
    controls: [...harness.store.inspectControls()],
    sessions: [...harness.store.inspectSessions()],
    users: harness.store.inspectUsers()
  });
  for (const secret of [SETUP_TOKEN, RECOVERY_TOKEN, STRONG_PASSWORD, NEW_PASSWORD, login.sessionToken]) {
    assert.equal(persisted.includes(secret), false, `persisted data exposed secret: ${secret.slice(0, 8)}`);
  }
  assert.equal(persisted.includes(hashSecret(SETUP_TOKEN)), true);
  assert.equal(persisted.includes(hashSecret(RECOVERY_TOKEN)), true);
});

test("Blob adapter uses strong conditional writes, bounded scans, and fail-closed reads", async () => {
  const values = new Map<string, unknown>();
  const writes: Array<{ key: string; options?: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  const listCalls: Array<Record<string, unknown>> = [];
  const fakeStore = {
    async delete(key: string) { deletes.push(key); values.delete(key); },
    async get(key: string) { return values.get(key) ?? null; },
    list(options: Record<string, unknown>) {
      listCalls.push(options);
      return { async *[Symbol.asyncIterator]() {
        const sessionKeys = [...values.keys()].filter((key) => key.startsWith("sessions/"));
        yield { blobs: sessionKeys.slice(0, 1).map((key) => ({ etag: "etag", key })), directories: [] };
        assert.equal(deletes.length, 0, "session deletion must wait until pagination finishes");
        yield {
          blobs: [...sessionKeys.slice(1), `sessions-archive/${"d".repeat(64)}`].map((key) => ({ etag: "etag", key })),
          directories: []
        };
      } };
    },
    async setJSON(key: string, value: unknown, options?: Record<string, unknown>) {
      writes.push({ key, options });
      if (options?.onlyIfNew === true && values.has(key)) return { modified: false };
      values.set(key, clone(value));
      return { etag: "etag", modified: true };
    }
  };
  let requestedStore: unknown;
  const store = createBlobAdminStore((options) => { requestedStore = options; return fakeStore as never; });
  const password = await hashPassword(STRONG_PASSWORD);
  const user: AdminUser = {
    id: "d73e0ef4-d502-4ba8-98ae-ec92b56701fe", email: "admin@example.com",
    emailNormalized: "admin@example.com", role: "admin", passwordHash: password.digest,
    passwordSalt: password.salt, passwordAlgorithm: password.algorithm,
    createdAt: "2026-08-26T10:00:00.000Z", updatedAt: "2026-08-26T10:00:00.000Z", active: true
  };
  assert.equal(await store.createUserOnce(user), true);
  assert.equal(await store.createUserOnce(user), false);
  assert.equal(await store.setControlOnce("setup-lock", { tokenFingerprint: "a".repeat(64) }), true);
  assert.equal(await store.setControlOnce("setup-lock", { tokenFingerprint: "a".repeat(64) }), false);
  assert.deepEqual(requestedStore, { consistency: "strong", name: "yyq-site-admin" });
  assert.deepEqual(writes.map(({ key, options }) => [key, options?.onlyIfNew]), [
    ["users/admin", true], ["users/admin", true], ["controls/setup-lock", true], ["controls/setup-lock", true]
  ]);

  const matchingHash = "b".repeat(64);
  const otherHash = "c".repeat(64);
  values.set(`sessions/${matchingHash}`, {
    tokenHash: matchingHash, userId: user.id, createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  values.set(`sessions/${otherHash}`, {
    tokenHash: otherHash, userId: "274107a7-bf72-4cea-8c79-6550ddce4e63", createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  await store.deleteSessionsForUser(user.id);
  assert.deepEqual(listCalls, [{ paginate: true, prefix: "sessions/" }]);
  assert.deepEqual(deletes, [`sessions/${matchingHash}`]);

  values.set("users/admin", { active: true });
  await assert.rejects(() => store.getOnlyUser(), /Invalid administrator user data/);
  values.set(`sessions/${matchingHash}`, {
    tokenHash: otherHash, userId: user.id, createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  await assert.rejects(() => store.getSession(matchingHash), /session.*key|key.*session/i);
});

test("recovery does not change the password before old sessions are invalidated", async () => {
  const store = createMemoryAdminStore();
  const originalDeleteSessions = store.deleteSessionsForUser;
  const harness = createTestService({ setupToken: SETUP_TOKEN, recoveryToken: RECOVERY_TOKEN, store });
  await harness.service.setup({ email: "admin@example.com", password: STRONG_PASSWORD, setupToken: SETUP_TOKEN });
  store.deleteSessionsForUser = async () => { throw new Error("simulated session deletion failure"); };

  await assert.rejects(
    () => harness.service.recover({ email: "admin@example.com", recoveryToken: RECOVERY_TOKEN, newPassword: NEW_PASSWORD }),
    /simulated session deletion failure/
  );
  store.deleteSessionsForUser = originalDeleteSessions;
  const login = await harness.service.login({
    email: "admin@example.com", password: STRONG_PASSWORD, rateLimitKey: "recovery-delete-failure-old-password"
  });
  assert.equal(login.user.email, "admin@example.com");
  await expectAuthError(
    () => harness.service.login({
      email: "admin@example.com", password: NEW_PASSWORD, rateLimitKey: "recovery-delete-failure-new-password"
    }),
    "invalid_credentials"
  );
});
