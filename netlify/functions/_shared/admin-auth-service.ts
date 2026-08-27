import { randomUUID } from "node:crypto";

import {
  createSessionToken,
  hashPassword,
  hashSecret,
  safeSecretEqual,
  verifyPassword,
  type PasswordDigest
} from "./admin-security.ts";
import {
  createBlobAdminStore,
  type AdminSession,
  type AdminStore,
  type AdminUser,
  type LoginAttempt
} from "./admin-store.ts";
import { getNetlifyEnv, type EnvironmentReader } from "./netlify-http.ts";

export type PublicAdminUser = {
  id: string;
  email: string;
  role: "admin";
};

export type SetupInput = {
  email: string;
  password: string;
  setupToken: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RecoverInput = {
  email: string;
  recoveryToken: string;
  newPassword: string;
};

export type AdminAuthService = {
  setup(input: SetupInput): Promise<{ user: PublicAdminUser; sessionToken: string }>;
  login(input: LoginInput & { rateLimitKey: string }): Promise<{ user: PublicAdminUser; sessionToken: string }>;
  authenticate(sessionToken: string | undefined): Promise<PublicAdminUser | null>;
  logout(sessionToken: string | undefined): Promise<void>;
  recover(input: RecoverInput): Promise<{ user: PublicAdminUser }>;
};

export type AdminAuthErrorCode =
  | "invalid_credentials"
  | "invalid_input"
  | "invalid_recovery_token"
  | "invalid_setup_token"
  | "rate_limited"
  | "setup_closed"
  | "setup_unavailable"
  | "token_consumed";

const ERROR_DETAILS: Record<AdminAuthErrorCode, { message: string; status: number }> = {
  invalid_credentials: { message: "Invalid email or password.", status: 401 },
  invalid_input: { message: "Invalid administrator input.", status: 422 },
  invalid_recovery_token: { message: "Invalid recovery credentials.", status: 401 },
  invalid_setup_token: { message: "Invalid setup credentials.", status: 401 },
  rate_limited: { message: "Too many login attempts.", status: 429 },
  setup_closed: { message: "Administrator setup is closed.", status: 409 },
  setup_unavailable: { message: "Administrator setup is unavailable.", status: 503 },
  token_consumed: { message: "This recovery token has already been used.", status: 409 }
};

export class AdminAuthError extends Error {
  readonly code: AdminAuthErrorCode;
  readonly status: number;

  constructor(code: AdminAuthErrorCode) {
    const details = ERROR_DETAILS[code];
    super(details.message);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = details.status;
  }
}

type AdminAuthServiceDependencies = {
  store?: AdminStore;
  now?: () => Date;
  readEnvironment?: EnvironmentReader;
};

const SETUP_CONTROL_KEY = "setup-lock";
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_OPERATOR_TOKEN_LENGTH = 32;
const MAX_OPERATOR_TOKEN_LENGTH = 512;
const MAX_RATE_LIMIT_KEY_LENGTH = 512;
const DUMMY_PASSWORD_RECORD: PasswordDigest = {
  algorithm: "scrypt",
  digest: Buffer.alloc(64).toString("base64url"),
  salt: Buffer.alloc(16).toString("base64url")
};

function publicUser(user: AdminUser): PublicAdminUser {
  return { email: user.email, id: user.id, role: user.role };
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new AdminAuthError("invalid_input");
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    throw new AdminAuthError("invalid_input");
  }
  return normalized;
}

function requirePassword(value: unknown) {
  if (typeof value !== "string") throw new AdminAuthError("invalid_input");
  return value;
}

function requireOperatorToken(value: unknown, code: "invalid_recovery_token" | "invalid_setup_token") {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_OPERATOR_TOKEN_LENGTH) {
    throw new AdminAuthError(code);
  }
  return value;
}

function configuredOperatorToken(value: string | undefined) {
  return Boolean(
    value && value.length >= MIN_OPERATOR_TOKEN_LENGTH && value.length <= MAX_OPERATOR_TOKEN_LENGTH && !/\s/.test(value)
  );
}

async function createPasswordRecord(password: unknown) {
  try {
    return await hashPassword(requirePassword(password));
  } catch (error) {
    if (error instanceof AdminAuthError) throw error;
    throw new AdminAuthError("invalid_input");
  }
}

function currentDate(now: () => Date) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Invalid administrator authentication clock.");
  }
  return new Date(value.getTime());
}

function currentAttempt(attempt: LoginAttempt | null, nowMs: number) {
  if (!attempt) return null;
  const startedAt = new Date(attempt.windowStartedAt).getTime();
  return nowMs - startedAt >= LOGIN_WINDOW_MS ? null : attempt;
}

export function createAdminAuthService({
  store = createBlobAdminStore(),
  now = () => new Date(),
  readEnvironment = getNetlifyEnv
}: AdminAuthServiceDependencies = {}): AdminAuthService {
  async function createSession(userId: string, date: Date) {
    const sessionToken = createSessionToken();
    const tokenHash = hashSecret(sessionToken);
    const createdAt = date.toISOString();
    const session: AdminSession = {
      tokenHash,
      userId,
      createdAt,
      expiresAt: new Date(date.getTime() + SESSION_LIFETIME_MS).toISOString(),
      lastSeenAt: createdAt
    };
    await store.setSession(session);
    return sessionToken;
  }

  async function recordLoginFailure(key: string, attempt: LoginAttempt | null, date: Date) {
    const activeAttempt = currentAttempt(attempt, date.getTime());
    const timestamp = date.toISOString();
    await store.setAttempt(key, {
      count: (activeAttempt?.count ?? 0) + 1,
      windowStartedAt: activeAttempt?.windowStartedAt ?? timestamp,
      lastAttemptAt: timestamp
    });
  }

  return {
    async setup(input) {
      const existingUser = await store.getOnlyUser();
      const existingLock = await store.getControl(SETUP_CONTROL_KEY);
      if (existingUser || existingLock) throw new AdminAuthError("setup_closed");

      const configuredToken = readEnvironment("ADMIN_SETUP_TOKEN");
      if (!configuredOperatorToken(configuredToken)) throw new AdminAuthError("setup_unavailable");
      const submittedToken = requireOperatorToken(input.setupToken, "invalid_setup_token");
      const configuredFingerprint = hashSecret(configuredToken!);
      if (!safeSecretEqual(configuredFingerprint, hashSecret(submittedToken))) {
        throw new AdminAuthError("invalid_setup_token");
      }

      const emailNormalized = normalizeEmail(input.email);
      const password = await createPasswordRecord(input.password);
      const date = currentDate(now);
      const timestamp = date.toISOString();
      const claimed = await store.setControlOnce(SETUP_CONTROL_KEY, {
        consumedAt: timestamp,
        tokenFingerprint: configuredFingerprint
      });
      if (!claimed) throw new AdminAuthError("setup_closed");

      const user: AdminUser = {
        id: randomUUID(),
        email: emailNormalized,
        emailNormalized,
        role: "admin",
        passwordHash: password.digest,
        passwordSalt: password.salt,
        passwordAlgorithm: password.algorithm,
        createdAt: timestamp,
        updatedAt: timestamp,
        active: true
      };
      if (!(await store.createUserOnce(user))) throw new AdminAuthError("setup_closed");

      return { sessionToken: await createSession(user.id, date), user: publicUser(user) };
    },

    async login(input) {
      const emailNormalized = normalizeEmail(input.email);
      const password = requirePassword(input.password);
      if (
        typeof input.rateLimitKey !== "string" ||
        input.rateLimitKey.length === 0 ||
        input.rateLimitKey.length > MAX_RATE_LIMIT_KEY_LENGTH
      ) {
        throw new AdminAuthError("invalid_input");
      }

      const date = currentDate(now);
      const storedAttempt = await store.getAttempt(input.rateLimitKey);
      const activeAttempt = currentAttempt(storedAttempt, date.getTime());
      if (activeAttempt?.count === LOGIN_FAILURE_LIMIT) throw new AdminAuthError("rate_limited");

      const user = await store.getUserByEmail(emailNormalized);
      const verified = await verifyPassword(
        password,
        user
          ? { algorithm: user.passwordAlgorithm, digest: user.passwordHash, salt: user.passwordSalt }
          : DUMMY_PASSWORD_RECORD
      );
      if (!user || !user.active || !verified) {
        await recordLoginFailure(input.rateLimitKey, activeAttempt, date);
        throw new AdminAuthError("invalid_credentials");
      }

      await store.deleteAttempt(input.rateLimitKey);
      return { sessionToken: await createSession(user.id, date), user: publicUser(user) };
    },

    async authenticate(sessionToken) {
      if (typeof sessionToken !== "string" || !SESSION_TOKEN_PATTERN.test(sessionToken)) return null;

      const tokenHash = hashSecret(sessionToken);
      try {
        const session = await store.getSession(tokenHash);
        if (!session) return null;

        const date = currentDate(now);
        if (new Date(session.expiresAt).getTime() <= date.getTime()) {
          await store.deleteSession(tokenHash);
          return null;
        }

        const user = await store.getOnlyUser();
        if (!user || !user.active || user.id !== session.userId) {
          await store.deleteSession(tokenHash);
          return null;
        }

        await store.setSession({ ...session, lastSeenAt: date.toISOString() });
        return publicUser(user);
      } catch {
        return null;
      }
    },

    async logout(sessionToken) {
      if (typeof sessionToken !== "string" || !SESSION_TOKEN_PATTERN.test(sessionToken)) return;
      await store.deleteSession(hashSecret(sessionToken));
    },

    async recover(input) {
      const configuredToken = readEnvironment("ADMIN_RECOVERY_TOKEN");
      const submittedToken = requireOperatorToken(input.recoveryToken, "invalid_recovery_token");
      if (!configuredOperatorToken(configuredToken)) throw new AdminAuthError("invalid_recovery_token");

      const configuredFingerprint = hashSecret(configuredToken!);
      if (!safeSecretEqual(configuredFingerprint, hashSecret(submittedToken))) {
        throw new AdminAuthError("invalid_recovery_token");
      }

      const emailNormalized = normalizeEmail(input.email);
      const user = await store.getUserByEmail(emailNormalized);
      if (!user) throw new AdminAuthError("invalid_recovery_token");
      const password = await createPasswordRecord(input.newPassword);
      const date = currentDate(now);
      const consumed = await store.setControlOnce(`recovery/${configuredFingerprint}`, {
        consumedAt: date.toISOString(),
        tokenFingerprint: configuredFingerprint
      });
      if (!consumed) throw new AdminAuthError("token_consumed");

      const updatedUser: AdminUser = {
        ...user,
        passwordHash: password.digest,
        passwordSalt: password.salt,
        passwordAlgorithm: password.algorithm,
        updatedAt: date.toISOString()
      };
      await store.deleteSessionsForUser(user.id);
      await store.updateUser(updatedUser);
      return { user: publicUser(updatedUser) };
    }
  };
}
