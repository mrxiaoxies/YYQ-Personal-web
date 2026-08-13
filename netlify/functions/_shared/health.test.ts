import assert from "node:assert/strict";
import test from "node:test";

import type { Context } from "@netlify/functions";

import { createHealthHandler } from "../health.ts";

const siteOrigin = "https://example.netlify.app";
const context = {
  requestId: "health-request-1",
  site: { url: siteOrigin }
} as Context;

function environment(values: Record<string, string>) {
  return (name: string) => values[name];
}

test("GET /api/health 在 Gateway 配置完整时返回 ready", async () => {
  const handler = createHealthHandler(
    environment({
      KNOWLEDGE_MODEL: "gpt-5.4-mini",
      NETLIFY_AI_GATEWAY_BASE_URL: "https://gateway.example",
      NETLIFY_AI_GATEWAY_KEY: "injected-key"
    })
  );
  const response = await handler(
    new Request(`${siteOrigin}/api/health`, { headers: { Origin: siteOrigin } }),
    context
  );
  const payload = (await response.json()) as {
    gateway: string;
    knowledge: { entryCount: number; topicCount: number; version: string };
    model: string;
    retrieval: {
      dimensions: number;
      indexEntryCount: number;
      indexTopicCount: number;
      indexReady: boolean;
      knowledgeVersion: string;
      mode: string;
      model: string;
    };
    status: string;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ready");
  assert.equal(payload.gateway, "netlify-ai-gateway");
  assert.equal(payload.model, "gpt-5.4-mini");
  assert.ok(payload.knowledge.entryCount > 0);
  assert.equal(payload.knowledge.topicCount, 5);
  assert.ok(payload.knowledge.version);
  assert.equal(payload.retrieval.mode, "hybrid");
  assert.equal(payload.retrieval.model, "bge-small-zh-v1.5");
  assert.equal(payload.retrieval.dimensions, 512);
  assert.equal(payload.retrieval.indexEntryCount, payload.knowledge.entryCount);
  assert.equal(payload.retrieval.indexTopicCount, payload.knowledge.topicCount);
  assert.equal(payload.retrieval.knowledgeVersion, payload.knowledge.version);
  assert.equal(payload.retrieval.indexReady, true);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), siteOrigin);
  assert.equal(response.headers.get("X-Request-Id"), "health-request-1");
});

test("GET /api/health 兼容成对配置的 OpenAI 服务端变量", async () => {
  const handler = createHealthHandler(
    environment({
      OPENAI_API_KEY: "private-key",
      OPENAI_BASE_URL: "https://openai-compatible.example/v1"
    })
  );
  const response = await handler(new Request(`${siteOrigin}/api/health`), context);
  const payload = (await response.json()) as { gateway: string; status: string };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ready");
  assert.equal(payload.gateway, "openai-compatible");
});

test("GET /api/health 不把半套 Gateway 变量误判为可用", async () => {
  const handler = createHealthHandler(
    environment({ NETLIFY_AI_GATEWAY_KEY: "injected-key" })
  );
  const response = await handler(new Request(`${siteOrigin}/api/health`), context);

  assert.equal(response.status, 503);
});

test("GET /api/health 在 Gateway 未注入时返回安全的 503", async () => {
  const handler = createHealthHandler(environment({}));
  const response = await handler(new Request(`${siteOrigin}/api/health`), context);
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.match(body, /gateway_not_configured/);
  assert.match(body, /"retrieval":\{/);
  assert.match(body, /"model":"bge-small-zh-v1.5"/);
  assert.doesNotMatch(body, /OPENAI_API_KEY|OPENAI_BASE_URL|NETLIFY_AI_GATEWAY/);
  assert.doesNotMatch(body, /model\.onnx|[A-Z]:\\|stack|embedding-error/i);
});

test("/api/health 支持 GitHub Pages CORS 预检", async () => {
  const handler = createHealthHandler(environment({}));
  const response = await handler(
    new Request(`${siteOrigin}/api/health`, {
      headers: { Origin: "https://mrxiaoxies.github.io" },
      method: "OPTIONS"
    }),
    context
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://mrxiaoxies.github.io");
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
});

test("/api/health 拒绝未授权网页来源", async () => {
  const handler = createHealthHandler(environment({}));
  const response = await handler(
    new Request(`${siteOrigin}/api/health`, { headers: { Origin: "https://attacker.example" } }),
    context
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});
