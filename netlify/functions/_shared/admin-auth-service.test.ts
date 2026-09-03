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
const DIFFERENT_SETUP_TOKEN = "different-setup-token-that-is-at-least-32-chars";
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

function createMemoryAdminStore(options: { createUserFailures?: number } = {}): MemoryAdminStore {
  const users = new Map<string, AdminUser>();
  const sessions = new Map<string, AdminSession>();
  const controls = new Map<string, Record<string, unknown>>();
  const attempts = new Map<string, { attempt: LoginAttempt; etag: string }>();
  let attemptEtagVersion = 0;
  let remainingCreateUserFailures = options.createUserFailures ?? 0;

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
      if (remainingCreateUserFailures > 0) {
        remainingCreateUserFailures -= 1;
        throw new Error("simulated administrator user write failure");
      }
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
      const snapshot = attempts.get(key);
      return snapshot ? clone(snapshot) : null;
    },
    async setAttempt(key, attempt, expectedEtag) {
      const current = attempts.get(key);
      if ((current === undefined && expectedEtag !== null) || (current !== undefined && current.etag !== expectedEtag)) {
        return false;
      }
      attemptEtagVersion += 1;
      attempts.set(key, { attempt: clone(attempt), etag: `memory-attempt-etag-${attemptEtagVersion}` });
      return true;
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
    inspectAttempts: () => new Map([...attempts].map(([key, snapshot]) => [key, Object.freeze(clone(snapshot.attempt))]))
  };
}

function createConcurrentCasAdminStore(expectedInitialWriters: number) {
  const store = createMemoryAdminStore();
  const attempts = new Map<string, { attempt: LoginAttempt; etag: string }>();
  let etagVersion = 0;
  let initialWriters = 0;
  let casConflicts = 0;
  let releaseInitialWriters!: () => void;
  const initialWritersReady = new Promise<void>((resolve) => { releaseInitialWriters = resolve; });
  const casMethods = store as unknown as {
    getAttempt(key: string): Promise<{ attempt: LoginAttempt; etag: string } | null>;
    setAttempt(key: string, attempt: LoginAttempt, expectedEtag: string | null): Promise<boolean>;
  };

  casMethods.getAttempt = async (key) => {
    const snapshot = attempts.get(key);
    return snapshot ? clone(snapshot) : null;
  };
  casMethods.setAttempt = async (key, attempt, expectedEtag) => {
    if (initialWriters < expectedInitialWriters) {
      initialWriters += 1;
      if (initialWriters === expectedInitialWriters) releaseInitialWriters();
      await initialWritersReady;
    }

    const current = attempts.get(key);
    if ((current === undefined && expectedEtag !== null) || (current !== undefined && current.etag !== expectedEtag)) {
      casConflicts += 1;
      return false;
    }
    etagVersion += 1;
    attempts.set(key, { attempt: clone(attempt), etag: `attempt-etag-${etagVersion}` });
    return true;
  };
  store.inspectAttempts = () => new Map(
    [...attempts].map(([key, snapshot]) => [key, Object.freeze(clone(snapshot.attempt))])
  );

  return { casConflicts: () => casConflicts, store };
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

function createLegacyMigrationBlobHarness(user: AdminUser) {
  const values = new Map<string, unknown>();
  const etags = new Map<string, string>();
  const writes: Array<{ key: string; modified: boolean; options?: Record<string, unknown>; value: unknown }> = [];
  let etagVersion = 0;

  function legacyRecord() {
    const legacy = clone(user) as unknown as Record<string, unknown>;
    delete legacy.generation;
    return legacy;
  }

  function replaceRawUser(value: unknown, etag = `legacy-etag-${++etagVersion}`) {
    values.set("users/admin", clone(value));
    etags.set("users/admin", etag);
  }

  const fakeStore = {
    async delete(key: string) {
      values.delete(key);
      etags.delete(key);
    },
    async get(key: string) {
      return values.has(key) ? clone(values.get(key)) : null;
    },
    async getWithMetadata(key: string) {
      if (!values.has(key)) return null;
      return { data: clone(values.get(key)), etag: etags.get(key), metadata: {} };
    },
    list(options: { prefix?: string }) {
      return {
        async *[Symbol.asyncIterator]() {
          const prefix = options.prefix ?? "";
          yield {
            blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ etag: etags.get(key), key })),
            directories: []
          };
        }
      };
    },
    async setJSON(key: string, value: unknown, options?: Record<string, unknown>) {
      let modified = true;
      if (options?.onlyIfNew === true && values.has(key)) modified = false;
      if (typeof options?.onlyIfMatch === "string" && etags.get(key) !== options.onlyIfMatch) modified = false;
      writes.push({ key, modified, options: options ? clone(options) : undefined, value: clone(value) });
      if (!modified) return { modified: false };
      etagVersion += 1;
      values.set(key, clone(value));
      etags.set(key, `etag-${etagVersion}`);
      return { etag: `etag-${etagVersion}`, modified: true };
    }
  };

  replaceRawUser(legacyRecord(), "legacy-etag-initial");
  return {
    etags,
    legacyRecord,
    replaceRawUser,
    store: createBlobAdminStore(() => fakeStore as never),
    values,
    writes
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
  assert.equal(harness.store.inspectUsers()[0]?.generation, 1);
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

test("pending setup lets the same token recover from a failed user write", async () => {
  const store = createMemoryAdminStore({ createUserFailures: 1 });
  const harness = createTestService({ setupToken: SETUP_TOKEN, store });

  await assert.rejects(
    () =>
      harness.service.setup({
        email: "admin@example.com",
        password: STRONG_PASSWORD,
        setupToken: SETUP_TOKEN
      }),
    /simulated administrator user write failure/
  );
  assert.equal(store.inspectUsers().length, 0);
  const pending = store.inspectControls().get("setup-lock");
  assert.equal(pending?.state, "pending");
  assert.equal(pending?.tokenFingerprint, hashSecret(SETUP_TOKEN));
  assert.equal(JSON.stringify(pending).includes(SETUP_TOKEN), false);

  harness.environment.set("ADMIN_SETUP_TOKEN", DIFFERENT_SETUP_TOKEN);
  await expectAuthError(
    () =>
      harness.service.setup({
        email: "takeover@example.com",
        password: STRONG_PASSWORD,
        setupToken: DIFFERENT_SETUP_TOKEN
      }),
    "setup_closed"
  );
  assert.equal(store.inspectUsers().length, 0);

  harness.environment.set("ADMIN_SETUP_TOKEN", SETUP_TOKEN);
  const retry = await harness.service.setup({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    setupToken: SETUP_TOKEN
  });
  assert.equal(retry.user.email, "admin@example.com");
  const completed = store.inspectControls().get("setup-lock");
  assert.equal(completed?.state, "completed");
  assert.equal(completed?.tokenFingerprint, hashSecret(SETUP_TOKEN));

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
  assert.equal(stored.generation, 1);
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

test("concurrent failed logins atomically reach the limit without lost updates", async () => {
  const casStore = createConcurrentCasAdminStore(6);
  const harness = createTestService({ setupToken: SETUP_TOKEN, store: casStore.store });
  await harness.service.setup({ email: "admin@example.com", password: STRONG_PASSWORD, setupToken: SETUP_TOKEN });
  const input = {
    email: "admin@example.com",
    password: "wrong-password-value",
    rateLimitKey: "admin@example.com|203.0.113.60"
  };

  const results = await Promise.allSettled(Array.from({ length: 6 }, () => harness.service.login(input)));
  const codes = results.map((result) => {
    assert.equal(result.status, "rejected");
    const reason = (result as PromiseRejectedResult).reason;
    assert.ok(reason instanceof AdminAuthError);
    return reason.code;
  });
  assert.deepEqual(codes.sort(), [
    "invalid_credentials",
    "invalid_credentials",
    "invalid_credentials",
    "invalid_credentials",
    "invalid_credentials",
    "rate_limited"
  ]);
  assert.equal(casStore.store.inspectAttempts().get(input.rateLimitKey)?.count, 5);
  assert.ok(casStore.casConflicts() > 0, "the fake must exercise real CAS conflicts");
  await expectAuthError(
    () => harness.service.login({ ...input, password: STRONG_PASSWORD }),
    "rate_limited"
  );
});

test("persistent attempt CAS conflicts fail closed after bounded retries", async () => {
  const harness = createTestService({ setupToken: SETUP_TOKEN });
  await harness.service.setup({ email: "admin@example.com", password: STRONG_PASSWORD, setupToken: SETUP_TOKEN });
  let conditionalWrites = 0;
  const conflictingStore = harness.store as unknown as {
    getAttempt(key: string): Promise<null>;
    setAttempt(key: string, attempt: LoginAttempt, expectedEtag: string | null): Promise<boolean>;
  };
  conflictingStore.getAttempt = async () => null;
  conflictingStore.setAttempt = async () => {
    conditionalWrites += 1;
    return false;
  };

  await expectAuthError(
    () => harness.service.login({
      email: "admin@example.com",
      password: "wrong-password-value",
      rateLimitKey: "persistent-cas-conflict"
    }),
    "rate_limited"
  );
  assert.equal(conditionalWrites, 8);
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

test("authentication deletes a session whose generation is stale", async () => {
  const harness = await createInitializedHarness();
  const login = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "stale-generation"
  });
  const user = harness.store.inspectUsers()[0];
  assert.ok(user);
  await harness.store.updateUser({
    ...user,
    generation: user.generation + 1,
    updatedAt: harness.clock.now().toISOString()
  });

  assert.equal(await harness.service.authenticate(login.sessionToken), null);
  assert.equal(await harness.store.getSession(hashSecret(login.sessionToken)), null);
});

test("an old-password login racing recovery creates only a stale rejected session", async () => {
  const harness = await createInitializedHarness();
  const originalSetSession = harness.store.setSession.bind(harness.store);
  let blockNextSession = true;
  let releaseSession!: () => void;
  let announceBlocked!: () => void;
  const blocked = new Promise<void>((resolve) => { announceBlocked = resolve; });
  const released = new Promise<void>((resolve) => { releaseSession = resolve; });
  harness.store.setSession = async (session) => {
    if (blockNextSession) {
      blockNextSession = false;
      announceBlocked();
      await released;
    }
    await originalSetSession(session);
  };

  const racingLogin = harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "old-password-race"
  });
  await blocked;
  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  releaseSession();
  const staleLogin = await racingLogin;

  const staleSession = await harness.store.getSession(hashSecret(staleLogin.sessionToken));
  assert.equal(staleSession?.generation, 1);
  assert.equal(harness.store.inspectUsers()[0]?.generation, 2);
  assert.equal(await harness.service.authenticate(staleLogin.sessionToken), null);
  assert.equal(await harness.store.getSession(hashSecret(staleLogin.sessionToken)), null);
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
  assert.equal(harness.store.inspectUsers()[0]?.generation, 2);
  assert.equal(await harness.service.authenticate(first.sessionToken), null);
  assert.equal(await harness.service.authenticate(second.sessionToken), null);
  await expectAuthError(
    () =>
      harness.service.recover({
        email: "admin@example.com",
        recoveryToken: RECOVERY_TOKEN,
        newPassword: NEW_PASSWORD
      }),
    "token_consumed"
  );
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

test("recovery resumes after the pending control is stored but the user update fails", async () => {
  const harness = await createInitializedHarness();
  const originalUpdateUser = harness.store.updateUser.bind(harness.store);
  let failNextUpdate = true;
  harness.store.updateUser = async (user) => {
    if (failNextUpdate) {
      failNextUpdate = false;
      throw new Error("simulated recovery user update failure");
    }
    await originalUpdateUser(user);
  };

  await assert.rejects(
    () => harness.service.recover({
      email: "admin@example.com",
      recoveryToken: RECOVERY_TOKEN,
      newPassword: NEW_PASSWORD
    }),
    /simulated recovery user update failure/
  );
  const pending = harness.store.inspectControls().get(`recovery/${hashSecret(RECOVERY_TOKEN)}`);
  assert.equal(pending?.state, "pending");
  assert.equal(pending?.targetGeneration, 2);
  assert.equal(harness.store.inspectUsers()[0]?.generation, 1);
  const pendingJson = JSON.stringify(pending);
  for (const secret of [RECOVERY_TOKEN, NEW_PASSWORD]) assert.equal(pendingJson.includes(secret), false);

  await expectAuthError(
    () => harness.service.recover({
      email: "other@example.com",
      recoveryToken: RECOVERY_TOKEN,
      newPassword: NEW_PASSWORD
    }),
    "invalid_recovery_token"
  );
  await expectAuthError(
    () => harness.service.recover({
      email: "admin@example.com",
      recoveryToken: RECOVERY_TOKEN,
      newPassword: ANOTHER_STRONG_PASSWORD
    }),
    "invalid_recovery_token"
  );
  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  assert.equal(harness.store.inspectUsers()[0]?.generation, 2);
  assert.equal(harness.store.inspectControls().get(`recovery/${hashSecret(RECOVERY_TOKEN)}`)?.state, "completed");
});

test("recovery logically revokes sessions before physical deletion and retries cleanup", async () => {
  const harness = await createInitializedHarness();
  const login = await harness.service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "delete-failure-session"
  });
  const originalDeleteSessions = harness.store.deleteSessionsForUser.bind(harness.store);
  let failNextDelete = true;
  harness.store.deleteSessionsForUser = async (userId) => {
    if (failNextDelete) {
      failNextDelete = false;
      throw new Error("simulated session deletion failure");
    }
    await originalDeleteSessions(userId);
  };

  await assert.rejects(
    () => harness.service.recover({
      email: "admin@example.com",
      recoveryToken: RECOVERY_TOKEN,
      newPassword: NEW_PASSWORD
    }),
    /simulated session deletion failure/
  );
  assert.equal(harness.store.inspectUsers()[0]?.generation, 2);
  assert.equal(await harness.service.authenticate(login.sessionToken), null);
  assert.equal(harness.store.inspectControls().get(`recovery/${hashSecret(RECOVERY_TOKEN)}`)?.state, "pending");

  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  assert.equal(harness.store.inspectSessions().size, 0);
  assert.equal(harness.store.inspectControls().get(`recovery/${hashSecret(RECOVERY_TOKEN)}`)?.state, "completed");
});

test("recovery retries safely when writing the completed control fails", async () => {
  const harness = await createInitializedHarness();
  const originalSetControl = harness.store.setControl.bind(harness.store);
  let failCompletedWrite = true;
  harness.store.setControl = async (key, value) => {
    if (key.startsWith("recovery/") && value.state === "completed" && failCompletedWrite) {
      failCompletedWrite = false;
      throw new Error("simulated completed control write failure");
    }
    await originalSetControl(key, value);
  };

  await assert.rejects(
    () => harness.service.recover({
      email: "admin@example.com",
      recoveryToken: RECOVERY_TOKEN,
      newPassword: NEW_PASSWORD
    }),
    /simulated completed control write failure/
  );
  assert.equal(harness.store.inspectUsers()[0]?.generation, 2);
  assert.equal(harness.store.inspectControls().get(`recovery/${hashSecret(RECOVERY_TOKEN)}`)?.state, "pending");

  await harness.service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  assert.equal(harness.store.inspectControls().get(`recovery/${hashSecret(RECOVERY_TOKEN)}`)?.state, "completed");
  await expectAuthError(
    () => harness.service.recover({
      email: "admin@example.com",
      recoveryToken: RECOVERY_TOKEN,
      newPassword: NEW_PASSWORD
    }),
    "token_consumed"
  );
});

test("exact legacy users migrate once with CAS and can login and recover", async () => {
  const password = await hashPassword(STRONG_PASSWORD);
  const user: AdminUser = {
    id: "35fcb91f-c349-43db-9b6c-a791c745e415",
    email: "admin@example.com",
    emailNormalized: "admin@example.com",
    role: "admin",
    passwordHash: password.digest,
    passwordSalt: password.salt,
    passwordAlgorithm: password.algorithm,
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    active: true,
    generation: 1
  };
  const blob = createLegacyMigrationBlobHarness(user);

  const concurrentUsers = await Promise.all([blob.store.getOnlyUser(), blob.store.getOnlyUser()]);
  assert.deepEqual(concurrentUsers.map((candidate) => candidate?.generation), [1, 1]);
  assert.equal(
    blob.writes.filter((write) =>
      write.key === "users/admin" &&
      write.modified &&
      write.options?.onlyIfMatch === "legacy-etag-initial"
    ).length,
    1
  );

  blob.replaceRawUser(blob.legacyRecord(), "legacy-etag-login");
  const service = createAdminAuthService({
    store: blob.store,
    now: () => new Date("2026-08-26T10:00:00.000Z"),
    readEnvironment: (name) => name === "ADMIN_RECOVERY_TOKEN" ? RECOVERY_TOKEN : undefined
  });
  const login = await service.login({
    email: "admin@example.com",
    password: STRONG_PASSWORD,
    rateLimitKey: "legacy-login"
  });
  assert.equal(login.user.email, "admin@example.com");
  assert.equal((blob.values.get("users/admin") as AdminUser).generation, 1);
  assert.equal(
    blob.writes.some((write) =>
      write.key === "users/admin" &&
      write.modified &&
      write.options?.onlyIfMatch === "legacy-etag-login" &&
      (write.value as AdminUser).generation === 1
    ),
    true
  );

  blob.replaceRawUser(blob.legacyRecord(), "legacy-etag-recovery");
  await service.recover({
    email: "admin@example.com",
    recoveryToken: RECOVERY_TOKEN,
    newPassword: NEW_PASSWORD
  });
  assert.equal(
    blob.writes.some((write) =>
      write.key === "users/admin" &&
      write.modified &&
      write.options?.onlyIfMatch === "legacy-etag-recovery" &&
      (write.value as AdminUser).generation === 1
    ),
    true
  );
  assert.equal((blob.values.get("users/admin") as AdminUser).generation, 2);
  assert.equal(await service.authenticate(login.sessionToken), null);
});

test("legacy user migration rejects missing, extra, and invalid fields", async () => {
  const password = await hashPassword(STRONG_PASSWORD);
  const user: AdminUser = {
    id: "36ca1490-eb89-4bfd-9cad-b82c796b7e12",
    email: "admin@example.com",
    emailNormalized: "admin@example.com",
    role: "admin",
    passwordHash: password.digest,
    passwordSalt: password.salt,
    passwordAlgorithm: password.algorithm,
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    active: true,
    generation: 1
  };
  const blob = createLegacyMigrationBlobHarness(user);
  const legacy = blob.legacyRecord();

  const missing = clone(legacy);
  delete missing.passwordSalt;
  blob.replaceRawUser(missing);
  await assert.rejects(() => blob.store.getOnlyUser(), /Invalid administrator user data/);

  blob.replaceRawUser({ ...legacy, unexpected: true });
  await assert.rejects(() => blob.store.getOnlyUser(), /Invalid administrator user data/);

  blob.replaceRawUser({ ...legacy, role: "owner" });
  await assert.rejects(() => blob.store.getOnlyUser(), /Invalid administrator user data/);
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
  const etags = new Map<string, string>();
  let etagVersion = 0;
  const fakeStore = {
    async delete(key: string) { deletes.push(key); values.delete(key); etags.delete(key); },
    async get(key: string) { return values.get(key) ?? null; },
    async getWithMetadata(key: string) {
      const data = values.get(key);
      return data === undefined ? null : { data: clone(data), etag: etags.get(key), metadata: {} };
    },
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
      if (typeof options?.onlyIfMatch === "string" && etags.get(key) !== options.onlyIfMatch) {
        return { modified: false };
      }
      etagVersion += 1;
      const etag = `etag-${etagVersion}`;
      values.set(key, clone(value));
      etags.set(key, etag);
      return { etag, modified: true };
    }
  };
  let requestedStore: unknown;
  const store = createBlobAdminStore((options) => { requestedStore = options; return fakeStore as never; });
  const password = await hashPassword(STRONG_PASSWORD);
  const user: AdminUser = {
    id: "d73e0ef4-d502-4ba8-98ae-ec92b56701fe", email: "admin@example.com",
    emailNormalized: "admin@example.com", role: "admin", passwordHash: password.digest,
    passwordSalt: password.salt, passwordAlgorithm: password.algorithm,
    createdAt: "2026-08-26T10:00:00.000Z", updatedAt: "2026-08-26T10:00:00.000Z", active: true,
    generation: 1
  };
  assert.equal(await store.createUserOnce(user), true);
  assert.equal(await store.createUserOnce(user), false);
  assert.equal(await store.setControlOnce("setup-lock", { tokenFingerprint: "a".repeat(64) }), true);
  assert.equal(await store.setControlOnce("setup-lock", { tokenFingerprint: "a".repeat(64) }), false);
  assert.deepEqual(requestedStore, { consistency: "strong", name: "yyq-site-admin" });
  assert.deepEqual(writes.map(({ key, options }) => [key, options?.onlyIfNew]), [
    ["users/admin", true], ["users/admin", true], ["controls/setup-lock", true], ["controls/setup-lock", true]
  ]);

  const attemptStore = store as unknown as {
    getAttempt(key: string): Promise<{ attempt: LoginAttempt; etag: string } | null>;
    setAttempt(key: string, attempt: LoginAttempt, expectedEtag: string | null): Promise<boolean>;
  };
  const attempt: LoginAttempt = {
    count: 1,
    windowStartedAt: "2026-08-26T10:00:00.000Z",
    lastAttemptAt: "2026-08-26T10:00:00.000Z"
  };
  assert.equal(await attemptStore.setAttempt("cas-key", attempt, null), true);
  const firstAttempt = await attemptStore.getAttempt("cas-key");
  assert.ok(firstAttempt?.etag);
  assert.deepEqual(firstAttempt?.attempt, attempt);
  assert.equal(await attemptStore.setAttempt("cas-key", { ...attempt, count: 2 }, "stale-etag"), false);
  assert.equal(await attemptStore.setAttempt("cas-key", { ...attempt, count: 2 }, firstAttempt!.etag), true);
  const updatedAttempt = await attemptStore.getAttempt("cas-key");
  assert.equal(updatedAttempt?.attempt.count, 2);
  assert.notEqual(updatedAttempt?.etag, firstAttempt?.etag);
  const attemptKey = `attempts/${hashSecret("cas-key")}`;
  etags.delete(attemptKey);
  await assert.rejects(() => attemptStore.getAttempt("cas-key"), /ETag/);
  etags.set(attemptKey, updatedAttempt!.etag);
  values.set(attemptKey, { ...attempt, count: 0 });
  await assert.rejects(() => attemptStore.getAttempt("cas-key"), /login-attempt data/);

  const matchingHash = "b".repeat(64);
  const otherHash = "c".repeat(64);
  values.set(`sessions/${matchingHash}`, {
    tokenHash: matchingHash, userId: user.id, generation: 1, createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  values.set(`sessions/${otherHash}`, {
    tokenHash: otherHash, userId: "274107a7-bf72-4cea-8c79-6550ddce4e63", generation: 1,
    createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  await store.deleteSessionsForUser(user.id);
  assert.deepEqual(listCalls, [{ paginate: true, prefix: "sessions/" }]);
  assert.deepEqual(deletes, [`sessions/${matchingHash}`]);

  values.set("users/admin", { active: true });
  await assert.rejects(() => store.getOnlyUser(), /Invalid administrator user data/);
  values.set("users/admin", { ...user, generation: 0 });
  await assert.rejects(() => store.getOnlyUser(), /Invalid administrator user data/);
  values.set(`sessions/${matchingHash}`, {
    tokenHash: matchingHash, userId: user.id, createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  await assert.rejects(() => store.getSession(matchingHash), /Invalid administrator session data/);
  values.set(`sessions/${matchingHash}`, {
    tokenHash: otherHash, userId: user.id, generation: 1, createdAt: "2026-08-26T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-08-26T10:00:00.000Z"
  });
  await assert.rejects(() => store.getSession(matchingHash), /session.*key|key.*session/i);
});
