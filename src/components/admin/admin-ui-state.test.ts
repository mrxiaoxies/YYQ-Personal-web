import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent } from "../../../shared/default-site-content.ts";
import { AdminApiError } from "../../lib/admin-api.ts";
import {
  adminErrorMessage,
  isAdminGenerationCurrent,
  isLocalViteLocation,
  isUnauthorizedAdminError,
  replacePublishedDocument,
  shouldSendFinalVisitorHeartbeat,
  shouldPollAdminStats
} from "./admin-ui-state.ts";

test("stats polling requires an authenticated visible home screen", () => {
  assert.equal(shouldPollAdminStats({ authenticated: true, screen: "home", visibility: "visible" }), true);
  assert.equal(shouldPollAdminStats({ authenticated: false, screen: "home", visibility: "visible" }), false);
  assert.equal(shouldPollAdminStats({ authenticated: true, screen: "edit", visibility: "visible" }), false);
  assert.equal(shouldPollAdminStats({ authenticated: true, screen: "home", visibility: "hidden" }), false);
});

test("visitor analytics cleanup never labels an event as the administrator route", () => {
  assert.equal(shouldSendFinalVisitorHeartbeat("#admin"), false);
  assert.equal(shouldSendFinalVisitorHeartbeat("#projects"), true);
  assert.equal(shouldSendFinalVisitorHeartbeat("#home"), true);
});

test("only HTTP 401 administrator errors are unauthorized", () => {
  assert.equal(isUnauthorizedAdminError(new AdminApiError("unauthorized", 401, "raw secret")), true);
  assert.equal(isUnauthorizedAdminError(new AdminApiError("content_conflict", 409, "raw secret")), false);
  assert.equal(isUnauthorizedAdminError(new Error("unauthorized")), false);
});

test("known administrator errors use safe messages without raw server text", () => {
  const conflict = adminErrorMessage(new AdminApiError("content_conflict", 409, "server payload"));
  const rateLimited = adminErrorMessage(new AdminApiError("rate_limited", 429, "server payload"));
  const unknown = adminErrorMessage(new AdminApiError("unknown", 500, "server payload"));

  assert.equal(conflict, "内容版本已更新，请重新载入最新内容后再试。");
  assert.equal(rateLimited, "尝试次数过多，请稍后再试。");
  assert.equal(unknown, "操作未完成，请稍后重试。");
  assert.equal([conflict, rateLimited, unknown].some((message) => message.includes("server payload")), false);
});

test("local Vite detection only accepts loopback development origins", () => {
  assert.equal(isLocalViteLocation({ hostname: "localhost", port: "5173", protocol: "http:" }), true);
  assert.equal(isLocalViteLocation({ hostname: "127.0.0.1", port: "5173", protocol: "http:" }), true);
  assert.equal(isLocalViteLocation({ hostname: "yyq-web.netlify.app", port: "", protocol: "https:" }), false);
  assert.equal(isLocalViteLocation({ hostname: "localhost", port: "8888", protocol: "http:" }), false);
});

test("published replacement uses a fresh document and ignores stale generations", () => {
  const current = structuredClone(defaultSiteContent);
  const published = structuredClone(defaultSiteContent);
  published.version = "content-next";

  const replacement = replacePublishedDocument(current, published);
  assert.equal(replacement, published);
  assert.notEqual(replacement, current);
  assert.equal(isAdminGenerationCurrent(4, 4, true), true);
  assert.equal(isAdminGenerationCurrent(4, 5, true), false);
  assert.equal(isAdminGenerationCurrent(4, 4, false), false);
});
