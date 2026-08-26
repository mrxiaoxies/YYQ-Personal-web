import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Context } from "@netlify/functions";

import { getNetlifyEnv } from "./netlify-http.ts";

export const ADMIN_SESSION_COOKIE = "yyq_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_BODY_LIMIT_BYTES = 128 * 1024;

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_DIGEST_BYTES = 64;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GITHUB_PAGES_HOSTNAME = "mrxiaoxies.github.io";
const LOCAL_ADMIN_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8888",
  "http://localhost:8888"
];

const scryptAsync = promisify(scrypt);

export type PasswordDigest = {
  algorithm: "scrypt";
  digest: string;
  salt: string;
};

export type AdminRequestOrigin = {
  allowed: boolean;
  origin: string | undefined;
};

function isValidPassword(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

function assertValidPassword(password: string) {
  if (!isValidPassword(password)) {
    throw new Error(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }
}

function normalizeOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function exactOrigin(value: string | undefined) {
  const normalized = normalizeOrigin(value);
  return normalized && normalized === value ? normalized : undefined;
}

function isGitHubPagesOrigin(value: string | undefined) {
  if (!value) return false;

  try {
    return new URL(value).hostname === GITHUB_PAGES_HOSTNAME;
  } catch {
    return false;
  }
}

function configuredAdminOrigins() {
  return (getNetlifyEnv("ADMIN_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => exactOrigin(value))
    .filter((value): value is string => Boolean(value && !isGitHubPagesOrigin(value)));
}

function decodeCanonicalBase64Url(value: string, expectedBytes: number) {
  if (!BASE64URL_PATTERN.test(value) || value.length !== Math.ceil((expectedBytes * 4) / 3)) return undefined;

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== expectedBytes || decoded.toString("base64url") !== value) return undefined;
  return decoded;
}

function cookieAttributes(maxAge: number) {
  return `Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function hashPassword(password: string): Promise<PasswordDigest> {
  assertValidPassword(password);
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const digest = (await scryptAsync(password, salt, PASSWORD_DIGEST_BYTES)) as Buffer;

  return {
    algorithm: "scrypt",
    digest: digest.toString("base64url"),
    salt: salt.toString("base64url")
  };
}

export async function verifyPassword(password: string, record: PasswordDigest): Promise<boolean> {
  if (!isValidPassword(password) || !record || record.algorithm !== "scrypt") return false;

  try {
    const salt = decodeCanonicalBase64Url(record.salt, PASSWORD_SALT_BYTES);
    const expectedDigest = decodeCanonicalBase64Url(record.digest, PASSWORD_DIGEST_BYTES);
    if (!salt || !expectedDigest) return false;

    const actualDigest = (await scryptAsync(password, salt, PASSWORD_DIGEST_BYTES)) as Buffer;
    return timingSafeEqual(actualDigest, expectedDigest);
  } catch {
    return false;
  }
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeSecretEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sessionCookie(token: string) {
  if (!SESSION_TOKEN_PATTERN.test(token)) throw new Error("Session token must be URL-safe.");
  return `${ADMIN_SESSION_COOKIE}=${token}; ${cookieAttributes(ADMIN_SESSION_MAX_AGE_SECONDS)}`;
}

export function clearSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

export function readSessionCookie(req: Request) {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return undefined;

  let token: string | undefined;
  let namedCookieOccurrences = 0;
  for (const value of cookieHeader.split(";")) {
    const [name, ...parts] = value.trim().split("=");
    if (name !== ADMIN_SESSION_COOKIE) continue;
    namedCookieOccurrences += 1;
    if (namedCookieOccurrences > 1) return undefined;
    token = parts.join("=") || undefined;
  }

  return namedCookieOccurrences === 1 && token && SESSION_TOKEN_PATTERN.test(token) ? token : undefined;
}

export function resolveAdminRequestOrigin(req: Request, context: Context): AdminRequestOrigin {
  const origin = req.headers.get("Origin");
  if (!origin) return { allowed: false, origin: undefined };

  const normalized = exactOrigin(origin);
  if (!normalized || isGitHubPagesOrigin(normalized)) {
    return { allowed: false, origin: undefined };
  }

  const allowedOrigins = new Set(
    [
      normalizeOrigin(req.url),
      normalizeOrigin(context.site?.url),
      ...LOCAL_ADMIN_ORIGINS,
      ...configuredAdminOrigins()
    ].filter((value): value is string => Boolean(value && !isGitHubPagesOrigin(value)))
  );

  return {
    allowed: allowedOrigins.has(normalized),
    origin: normalized
  };
}

export async function readBoundedJson(req: Request, maxBytes = ADMIN_BODY_LIMIT_BYTES): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("JSON body limit must be a non-negative integer.");
  }

  const contentLength = req.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new Error("JSON request body is too large.");
  }

  if (!req.body) throw new Error("Invalid JSON request body.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("JSON request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}
