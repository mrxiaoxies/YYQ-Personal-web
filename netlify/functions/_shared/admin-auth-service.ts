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

type SetupControl =
  | { state: "pending"; tokenFingerprint: string; createdAt: string }
  | { state: "completed"; tokenFingerprint: string; createdAt: string; completedAt: string };

type PendingRecoveryControl = {
  state: "pending";
  tokenFingerprint: string;
  operationId: string;
  userId: string;
  emailNormalized: string;
  targetGeneration: number;
  passwordHash: string;
  passwordSalt: string;
  passwordAlgorithm: "scrypt";
  createdAt: string;
  updatedAt: string;
};

type RecoveryControl =
  | PendingRecoveryControl
  | {
      state: "completed";
      tokenFingerprint: string;
      operationId: string;
      userId: string;
      emailNormalized: string;
      targetGeneration: number;
      createdAt: string;
      completedAt: string;
    };

const SETUP_CONTROL_KEY = "setup-lock";
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_ATTEMPT_CAS_RETRIES = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_OPERATOR_TOKEN_LENGTH = 32;
const MAX_OPERATOR_TOKEN_LENGTH = 512;
const MAX_RATE_LIMIT_KEY_LENGTH = 512;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
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

function isIsoDate(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") return false;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === candidate;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPositiveGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseSetupControl(value: Record<string, unknown> | null): SetupControl | null {
  if (value === null) return null;
  const keys = Object.keys(value).sort();
  const pendingKeys = ["createdAt", "state", "tokenFingerprint"];
  const completedKeys = ["completedAt", "createdAt", "state", "tokenFingerprint"];
  const expectedKeys = value.state === "pending" ? pendingKeys : value.state === "completed" ? completedKeys : null;
  if (
    !expectedKeys ||
    keys.length !== expectedKeys.length ||
    !keys.every((key, index) => key === expectedKeys[index]) ||
    typeof value.tokenFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.tokenFingerprint) ||
    !isIsoDate(value.createdAt) ||
    (value.state === "completed" && !isIsoDate(value.completedAt))
  ) {
    throw new AdminAuthError("setup_closed");
  }

  return value as SetupControl;
}

function parseRecoveryControl(value: Record<string, unknown> | null): RecoveryControl | null {
  if (value === null) return null;

  const pendingKeys = [
    "createdAt",
    "emailNormalized",
    "operationId",
    "passwordAlgorithm",
    "passwordHash",
    "passwordSalt",
    "state",
    "targetGeneration",
    "tokenFingerprint",
    "updatedAt",
    "userId"
  ];
  const completedKeys = [
    "completedAt",
    "createdAt",
    "emailNormalized",
    "operationId",
    "state",
    "targetGeneration",
    "tokenFingerprint",
    "userId"
  ];
  const expectedKeys = value.state === "pending" ? pendingKeys : value.state === "completed" ? completedKeys : null;
  const commonValid =
    expectedKeys !== null &&
    hasExactKeys(value, expectedKeys) &&
    typeof value.tokenFingerprint === "string" &&
    SHA256_PATTERN.test(value.tokenFingerprint) &&
    typeof value.operationId === "string" &&
    UUID_PATTERN.test(value.operationId) &&
    typeof value.userId === "string" &&
    UUID_PATTERN.test(value.userId) &&
    typeof value.emailNormalized === "string" &&
    value.emailNormalized.length > 0 &&
    value.emailNormalized.length <= 320 &&
    value.emailNormalized === value.emailNormalized.trim().toLowerCase() &&
    EMAIL_PATTERN.test(value.emailNormalized) &&
    isPositiveGeneration(value.targetGeneration) &&
    isIsoDate(value.createdAt);

  if (
    !commonValid ||
    (value.state === "pending" &&
      (value.passwordAlgorithm !== "scrypt" ||
        typeof value.passwordHash !== "string" ||
        value.passwordHash.length !== 86 ||
        !BASE64URL_PATTERN.test(value.passwordHash) ||
        typeof value.passwordSalt !== "string" ||
        value.passwordSalt.length !== 22 ||
        !BASE64URL_PATTERN.test(value.passwordSalt) ||
        !isIsoDate(value.updatedAt))) ||
    (value.state === "completed" && !isIsoDate(value.completedAt))
  ) {
    throw new AdminAuthError("invalid_recovery_token");
  }

  return value as RecoveryControl;
}

export function createAdminAuthService({
  store = createBlobAdminStore(),
  now = () => new Date(),
  readEnvironment = getNetlifyEnv
}: AdminAuthServiceDependencies = {}): AdminAuthService {
  async function createSession(user: Pick<AdminUser, "generation" | "id">, date: Date) {
    const sessionToken = createSessionToken();
    const tokenHash = hashSecret(sessionToken);
    const createdAt = date.toISOString();
    const session: AdminSession = {
      tokenHash,
      userId: user.id,
      generation: user.generation,
      createdAt,
      expiresAt: new Date(date.getTime() + SESSION_LIFETIME_MS).toISOString(),
      lastSeenAt: createdAt
    };
    await store.setSession(session);
    return sessionToken;
  }

  async function recordLoginFailure(key: string, date: Date) {
    const timestamp = date.toISOString();
    for (let retry = 0; retry < LOGIN_ATTEMPT_CAS_RETRIES; retry += 1) {
      const snapshot = await store.getAttempt(key);
      const activeAttempt = currentAttempt(snapshot?.attempt ?? null, date.getTime());
      if (activeAttempt && activeAttempt.count >= LOGIN_FAILURE_LIMIT) {
        throw new AdminAuthError("rate_limited");
      }
      const nextAttempt: LoginAttempt = {
        count: (activeAttempt?.count ?? 0) + 1,
        windowStartedAt: activeAttempt?.windowStartedAt ?? timestamp,
        lastAttemptAt: timestamp
      };
      if (await store.setAttempt(key, nextAttempt, snapshot?.etag ?? null)) return;
    }
    throw new AdminAuthError("rate_limited");
  }

  return {
    async setup(input) {
      if (await store.getOnlyUser()) throw new AdminAuthError("setup_closed");

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
      let control = parseSetupControl(await store.getControl(SETUP_CONTROL_KEY));
      if (control === null) {
        const pending: SetupControl = {
          state: "pending",
          tokenFingerprint: configuredFingerprint,
          createdAt: timestamp
        };
        control = (await store.setControlOnce(SETUP_CONTROL_KEY, pending))
          ? pending
          : parseSetupControl(await store.getControl(SETUP_CONTROL_KEY));
      }
      if (
        control === null ||
        control.state !== "pending" ||
        !safeSecretEqual(control.tokenFingerprint, configuredFingerprint)
      ) {
        throw new AdminAuthError("setup_closed");
      }

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
        active: true,
        generation: 1
      };
      if (!(await store.createUserOnce(user))) throw new AdminAuthError("setup_closed");
      await store.setControl(SETUP_CONTROL_KEY, {
        state: "completed",
        tokenFingerprint: control.tokenFingerprint,
        createdAt: control.createdAt,
        completedAt: timestamp
      });

      return { sessionToken: await createSession(user, date), user: publicUser(user) };
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
      const activeAttempt = currentAttempt(storedAttempt?.attempt ?? null, date.getTime());
      if (activeAttempt && activeAttempt.count >= LOGIN_FAILURE_LIMIT) throw new AdminAuthError("rate_limited");

      const user = await store.getUserByEmail(emailNormalized);
      const verified = await verifyPassword(
        password,
        user
          ? { algorithm: user.passwordAlgorithm, digest: user.passwordHash, salt: user.passwordSalt }
          : DUMMY_PASSWORD_RECORD
      );
      if (!user || !user.active || !verified) {
        await recordLoginFailure(input.rateLimitKey, date);
        throw new AdminAuthError("invalid_credentials");
      }

      await store.deleteAttempt(input.rateLimitKey);
      return { sessionToken: await createSession(user, date), user: publicUser(user) };
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
        if (
          !user ||
          !user.active ||
          user.id !== session.userId ||
          user.generation !== session.generation
        ) {
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
      const submittedPassword = requirePassword(input.newPassword);
      const controlKey = `recovery/${configuredFingerprint}`;
      let control = parseRecoveryControl(await store.getControl(controlKey));
      if (control?.state === "completed") throw new AdminAuthError("token_consumed");

      if (control === null) {
        const user = await store.getUserByEmail(emailNormalized);
        if (!user || user.generation === Number.MAX_SAFE_INTEGER) {
          throw new AdminAuthError("invalid_recovery_token");
        }
        const password = await createPasswordRecord(submittedPassword);
        const date = currentDate(now);
        const timestamp = date.toISOString();
        const pending: PendingRecoveryControl = {
          state: "pending",
          tokenFingerprint: configuredFingerprint,
          operationId: randomUUID(),
          userId: user.id,
          emailNormalized,
          targetGeneration: user.generation + 1,
          passwordHash: password.digest,
          passwordSalt: password.salt,
          passwordAlgorithm: password.algorithm,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        control = (await store.setControlOnce(controlKey, pending))
          ? pending
          : parseRecoveryControl(await store.getControl(controlKey));
        if (control?.state === "completed") throw new AdminAuthError("token_consumed");
      }

      if (
        control === null ||
        control.state !== "pending" ||
        !safeSecretEqual(control.tokenFingerprint, configuredFingerprint) ||
        control.emailNormalized !== emailNormalized
      ) {
        throw new AdminAuthError("invalid_recovery_token");
      }

      let passwordMatches = false;
      try {
        passwordMatches = await verifyPassword(submittedPassword, {
          algorithm: control.passwordAlgorithm,
          digest: control.passwordHash,
          salt: control.passwordSalt
        });
      } catch {
        throw new AdminAuthError("invalid_recovery_token");
      }
      if (!passwordMatches) throw new AdminAuthError("invalid_recovery_token");

      const currentUser = await store.getUserByEmail(emailNormalized);
      if (!currentUser || currentUser.id !== control.userId) {
        throw new AdminAuthError("invalid_recovery_token");
      }

      let recoveredUser = currentUser;
      if (currentUser.generation === control.targetGeneration - 1) {
        recoveredUser = {
          ...currentUser,
          generation: control.targetGeneration,
          passwordHash: control.passwordHash,
          passwordSalt: control.passwordSalt,
          passwordAlgorithm: control.passwordAlgorithm,
          updatedAt: currentDate(now).toISOString()
        };
        await store.updateUser(recoveredUser);
      } else if (
        currentUser.generation !== control.targetGeneration ||
        currentUser.passwordHash !== control.passwordHash ||
        currentUser.passwordSalt !== control.passwordSalt ||
        currentUser.passwordAlgorithm !== control.passwordAlgorithm
      ) {
        throw new AdminAuthError("invalid_recovery_token");
      }

      await store.deleteSessionsForUser(control.userId);
      const completedAt = currentDate(now).toISOString();
      await store.setControl(controlKey, {
        state: "completed",
        tokenFingerprint: control.tokenFingerprint,
        operationId: control.operationId,
        userId: control.userId,
        emailNormalized: control.emailNormalized,
        targetGeneration: control.targetGeneration,
        createdAt: control.createdAt,
        completedAt
      });
      return { user: publicUser(recoveredUser) };
    }
  };
}
