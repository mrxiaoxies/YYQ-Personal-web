import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "@netlify/functions";

import {
  ADMIN_BODY_LIMIT_BYTES,
  ADMIN_SESSION_COOKIE,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  hashSecret,
  readBoundedJson,
  readSessionCookie,
  resolveAdminRequestOrigin,
  safeSecretEqual,
  sessionCookie,
  verifyPassword
} from "./admin-security.ts";

const requestContext = (siteUrl?: string) => ({
  site: siteUrl ? { url: siteUrl } : undefined
}) as Context;

async function withConfiguredOrigins<T>(origins: string | undefined, operation: () => Promise<T> | T) {
  const previous = process.env.ADMIN_ALLOWED_ORIGINS;
  if (origins === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS;
  else process.env.ADMIN_ALLOWED_ORIGINS = origins;

  try {
    return await operation();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS;
    else process.env.ADMIN_ALLOWED_ORIGINS = previous;
  }
}

test("password hashing uses scrypt with unique salts", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");

  assert.equal(first.algorithm, "scrypt");
  assert.notEqual(first.salt, second.salt);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("password hashing accepts only passwords from 12 through 128 characters", async () => {
  assert.equal((await hashPassword("a".repeat(12))).algorithm, "scrypt");
  assert.equal((await hashPassword("a".repeat(128))).algorithm, "scrypt");
  await assert.rejects(() => hashPassword("a".repeat(11)), /12 and 128/);
  await assert.rejects(() => hashPassword("a".repeat(129)), /12 and 128/);
});

test("secret comparisons reject unequal lengths before comparison", () => {
  const digest = hashSecret("recovery-token");

  assert.equal(safeSecretEqual(digest, hashSecret("recovery-token")), true);
  assert.equal(safeSecretEqual(digest, hashSecret("different-token")), false);
  assert.equal(safeSecretEqual(digest, "too-short"), false);
});

test("session tokens are random URL-safe values", () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test("session cookies are host-safe and script-inaccessible", () => {
  const cookie = sessionCookie("session-token");
  const cleared = clearSessionCookie();

  assert.match(cookie, new RegExp(`^${ADMIN_SESSION_COOKIE}=session-token;`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=604800/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cleared, /Max-Age=0/i);
  assert.match(cleared, /HttpOnly/i);
  assert.match(cleared, /Secure/i);
  assert.match(cleared, /SameSite=Lax/i);
  assert.match(cleared, /Path=\//i);
});

test("session cookie reading returns only the named cookie", () => {
  assert.equal(readSessionCookie(new Request("https://admin.example.com")), undefined);
  assert.equal(
    readSessionCookie(
      new Request("https://admin.example.com", {
        headers: { Cookie: "other=value; yyq_admin_session=session-token; another=value" }
      })
    ),
    "session-token"
  );
  assert.equal(
    readSessionCookie(
      new Request("https://admin.example.com", {
        headers: { Cookie: "not_yyq_admin_session=session-token" }
      })
    ),
    undefined
  );
});

test("admin request origins require an exact configured or local origin", async () => {
  await withConfiguredOrigins("https://admin.example.com,not a URL,ftp://invalid.example.com", () => {
    const context = requestContext("https://site-name.netlify.app");

    assert.deepEqual(
      resolveAdminRequestOrigin(
        new Request("https://function.example.com/.netlify/functions/admin", {
          headers: { Origin: "https://function.example.com" }
        }),
        context
      ),
      { allowed: true, origin: "https://function.example.com" }
    );
    assert.equal(
      resolveAdminRequestOrigin(
        new Request("https://function.example.com/.netlify/functions/admin", {
          headers: { Origin: "https://site-name.netlify.app" }
        }),
        context
      ).allowed,
      true
    );
    assert.equal(
      resolveAdminRequestOrigin(
        new Request("https://function.example.com/.netlify/functions/admin", {
          headers: { Origin: "http://localhost:5173" }
        }),
        context
      ).allowed,
      true
    );
    assert.equal(
      resolveAdminRequestOrigin(
        new Request("https://function.example.com/.netlify/functions/admin", {
          headers: { Origin: "https://admin.example.com" }
        }),
        context
      ).allowed,
      true
    );
  });
});

test("admin request origins reject missing, malformed, non-exact, and GitHub Pages values", async () => {
  await withConfiguredOrigins("https://admin.example.com", () => {
    const context = requestContext("https://site-name.netlify.app");
    const origin = (value?: string) =>
      resolveAdminRequestOrigin(
        new Request("https://function.example.com/.netlify/functions/admin", {
          headers: value ? { Origin: value } : undefined
        }),
        context
      );

    assert.deepEqual(origin(), { allowed: false, origin: undefined });
    assert.equal(origin("not a URL").allowed, false);
    assert.equal(origin("null").allowed, false);
    assert.equal(origin("https://admin.example.com/").allowed, false);
    assert.equal(origin("https://admin.example.com/path").allowed, false);
    assert.equal(origin("https://mrxiaoxies.github.io").allowed, false);
  });
});

test("bounded JSON permits a 128 KiB body and rejects a body over the limit", async () => {
  const atLimit = JSON.stringify({ value: "a".repeat(ADMIN_BODY_LIMIT_BYTES - 12) });
  const overLimit = JSON.stringify({ value: "a".repeat(ADMIN_BODY_LIMIT_BYTES) });

  assert.equal(new TextEncoder().encode(atLimit).byteLength, ADMIN_BODY_LIMIT_BYTES);
  assert.deepEqual(
    await readBoundedJson(
      new Request("https://admin.example.com", { method: "POST", body: atLimit }),
      ADMIN_BODY_LIMIT_BYTES
    ),
    JSON.parse(atLimit)
  );
  await assert.rejects(
    () =>
      readBoundedJson(
        new Request("https://admin.example.com", { method: "POST", body: overLimit }),
        ADMIN_BODY_LIMIT_BYTES
      ),
    /too large/i
  );
});
