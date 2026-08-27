import { getStore, type Store } from "@netlify/blobs";

import { hashSecret } from "./admin-security.ts";

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

export type LoginAttempt = {
  count: number;
  windowStartedAt: string;
  lastAttemptAt: string;
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

const STORE_NAME = "yyq-site-admin";
const USER_KEY = "users/admin";
const CONTROL_PREFIX = "controls/";
const SESSION_PREFIX = "sessions/";
const ATTEMPT_PREFIX = "attempts/";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CONTROL_KEY_PATTERN = /^[A-Za-z0-9/_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isCanonicalEmail(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 320 && value === value.trim();
}

function parseAdminUser(value: unknown): AdminUser {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "active",
      "createdAt",
      "email",
      "emailNormalized",
      "id",
      "passwordAlgorithm",
      "passwordHash",
      "passwordSalt",
      "role",
      "updatedAt"
    ]) ||
    typeof value.active !== "boolean" ||
    !isIsoDate(value.createdAt) ||
    !isCanonicalEmail(value.email) ||
    !isCanonicalEmail(value.emailNormalized) ||
    value.emailNormalized !== value.emailNormalized.toLowerCase() ||
    !UUID_PATTERN.test(String(value.id)) ||
    value.passwordAlgorithm !== "scrypt" ||
    typeof value.passwordHash !== "string" ||
    value.passwordHash.length !== 86 ||
    !BASE64URL_PATTERN.test(value.passwordHash) ||
    typeof value.passwordSalt !== "string" ||
    value.passwordSalt.length !== 22 ||
    !BASE64URL_PATTERN.test(value.passwordSalt) ||
    value.role !== "admin" ||
    !isIsoDate(value.updatedAt)
  ) {
    throw new Error("Invalid administrator user data in Blob storage.");
  }

  return value as AdminUser;
}

function parseAdminSession(value: unknown): AdminSession {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["createdAt", "expiresAt", "lastSeenAt", "tokenHash", "userId"]) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.expiresAt) ||
    !isIsoDate(value.lastSeenAt) ||
    typeof value.tokenHash !== "string" ||
    !SHA256_PATTERN.test(value.tokenHash) ||
    typeof value.userId !== "string" ||
    !UUID_PATTERN.test(value.userId)
  ) {
    throw new Error("Invalid administrator session data in Blob storage.");
  }

  return value as AdminSession;
}

function parseLoginAttempt(value: unknown): LoginAttempt {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["count", "lastAttemptAt", "windowStartedAt"]) ||
    !Number.isSafeInteger(value.count) ||
    Number(value.count) < 1 ||
    Number(value.count) > 5 ||
    !isIsoDate(value.lastAttemptAt) ||
    !isIsoDate(value.windowStartedAt)
  ) {
    throw new Error("Invalid administrator login-attempt data in Blob storage.");
  }

  return value as LoginAttempt;
}

function parseControl(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid administrator control data in Blob storage.");
  return value;
}

function assertControlKey(key: string) {
  if (
    key.length === 0 ||
    key.length > 180 ||
    !CONTROL_KEY_PATTERN.test(key) ||
    key.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid administrator control key.");
  }
}

async function readJson<T>(store: Store, key: string, parser: (value: unknown) => T): Promise<T | null> {
  const value = (await store.get(key, { type: "json" })) as unknown;
  return value === null ? null : parser(value);
}

type AdminBlobStoreFactory = (options: { consistency: "strong"; name: string }) => Store;

export function createBlobAdminStore(
  createStore: AdminBlobStoreFactory = (options) => getStore(options)
): AdminStore {
  const store = createStore({ consistency: "strong", name: STORE_NAME });

  return {
    async getUserByEmail(emailNormalized) {
      const user = await readJson(store, USER_KEY, parseAdminUser);
      return user?.emailNormalized === emailNormalized ? user : null;
    },

    async getOnlyUser() {
      return readJson(store, USER_KEY, parseAdminUser);
    },

    async createUserOnce(user) {
      const validated = parseAdminUser(user);
      const result = await store.setJSON(USER_KEY, validated, { onlyIfNew: true });
      return result.modified;
    },

    async getControl(key) {
      assertControlKey(key);
      return readJson(store, `${CONTROL_PREFIX}${key}`, parseControl);
    },

    async setControlOnce(key, value) {
      assertControlKey(key);
      const validated = parseControl(value);
      const result = await store.setJSON(`${CONTROL_PREFIX}${key}`, validated, { onlyIfNew: true });
      return result.modified;
    },

    async setControl(key, value) {
      assertControlKey(key);
      await store.setJSON(`${CONTROL_PREFIX}${key}`, parseControl(value));
    },

    async getSession(tokenHash) {
      if (!SHA256_PATTERN.test(tokenHash)) return null;
      const session = await readJson(store, `${SESSION_PREFIX}${tokenHash}`, parseAdminSession);
      if (session && session.tokenHash !== tokenHash) {
        throw new Error("Administrator session key does not match the stored token hash.");
      }
      return session;
    },

    async setSession(session) {
      const validated = parseAdminSession(session);
      await store.setJSON(`${SESSION_PREFIX}${validated.tokenHash}`, validated);
    },

    async deleteSession(tokenHash) {
      if (!SHA256_PATTERN.test(tokenHash)) return;
      await store.delete(`${SESSION_PREFIX}${tokenHash}`);
    },

    async deleteSessionsForUser(userId) {
      if (!UUID_PATTERN.test(userId)) throw new Error("Invalid administrator user ID.");

      const sessionKeys: string[] = [];
      const boundedSessionKey = new RegExp(`^${SESSION_PREFIX}[0-9a-f]{64}$`);
      for await (const page of store.list({ paginate: true, prefix: SESSION_PREFIX })) {
        for (const blob of page.blobs) {
          if (boundedSessionKey.test(blob.key)) sessionKeys.push(blob.key);
        }
      }

      for (const sessionKey of sessionKeys) {
        try {
          const session = await readJson(store, sessionKey, parseAdminSession);
          if (session && `${SESSION_PREFIX}${session.tokenHash}` !== sessionKey) {
            throw new Error("Administrator session key does not match the stored token hash.");
          }
          if (session?.userId === userId) await store.delete(sessionKey);
        } catch {
          await store.delete(sessionKey);
        }
      }
    },

    async getAttempt(key) {
      const attemptKey = `${ATTEMPT_PREFIX}${hashSecret(key)}`;
      return readJson(store, attemptKey, parseLoginAttempt);
    },

    async setAttempt(key, attempt) {
      const attemptKey = `${ATTEMPT_PREFIX}${hashSecret(key)}`;
      await store.setJSON(attemptKey, parseLoginAttempt(attempt));
    },

    async deleteAttempt(key) {
      await store.delete(`${ATTEMPT_PREFIX}${hashSecret(key)}`);
    },

    async updateUser(user) {
      await store.setJSON(USER_KEY, parseAdminUser(user));
    }
  };
}
