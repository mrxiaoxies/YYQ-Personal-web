import assert from "node:assert/strict";
import test from "node:test";

import type { Context } from "@netlify/functions";

import { createAskHandler, parseGeneratedAnswer, summarizeModelError } from "../ask.ts";
import { retrieveKnowledge } from "./retrieval.ts";

const siteOrigin = "https://example.netlify.app";
const context = {
  requestId: "request-test-1",
  site: { url: siteOrigin }
} as Context;

function jsonRequest(body: unknown, options: { method?: string; origin?: string } = {}) {
  return new Request(`${siteOrigin}/api/ask`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(options.origin ? { Origin: options.origin } : {})
    },
    method: options.method ?? "POST"
  });
}

test("模型诊断只保留安全字段并脱敏凭据", () => {
  const error = Object.assign(
    new Error("upstream rejected Bearer private-token and sk-secret-value"),
    { code: "bad_gateway", request_id: "provider-request-1", status: 502, type: "gateway_error" }
  );
  const summary = summarizeModelError(error);

  assert.equal(summary.status, 502);
  assert.equal(summary.code, "bad_gateway");
  assert.equal(summary.type, "gateway_error");
  assert.equal(summary.requestId, "provider-request-1");
  assert.doesNotMatch(summary.message ?? "", /private-token|sk-secret-value/);
  assert.match(summary.message ?? "", /\[redacted\]/);
  assert.equal("stack" in summary, false);
});

test("POST /api/ask 返回模型回答和服务端检索来源", async () => {
  let modelCalls = 0;
  const handler = createAskHandler(async ({ evidence }) => {
    modelCalls += 1;
    assert.match(evidence, /work-lanjian-edge-ai/);
    return "公开经历显示，他使用 jtop 和 stress 验证工控机运行状态与压力表现。";
  });

  const response = await handler(
    jsonRequest(
      { conversation: [], question: "NANO 模块烧录后怎样用 jtop 和 stress 做压力测试？" },
      { origin: siteOrigin }
    ),
    context
  );
  const payload = (await response.json()) as {
    answer: string;
    retrievalTrace: { decision: string; mode: string };
    sources: Array<{ title: string }>;
    suggestions: string[];
  };

  assert.equal(response.status, 200);
  assert.equal(modelCalls, 1);
  assert.match(payload.answer, /jtop/);
  assert.equal(payload.retrievalTrace.decision, "answered");
  assert.equal(payload.retrievalTrace.mode, "lexical");
  assert.equal(payload.sources[0]?.title, "自研边缘化 AI 工控机测试");
  assert.ok(payload.suggestions.length > 0);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), siteOrigin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vary"), "Origin");
  assert.equal(response.headers.get("X-Request-Id"), "request-test-1");
});

test("无关问题在 HTTP 层返回安全拒答且不调用模型", async () => {
  let modelCalls = 0;
  let retrieverCalls = 0;
  const handler = createAskHandler(async () => {
    modelCalls += 1;
    return "不应调用";
  }, async (query) => {
    retrieverCalls += 1;
    return retrieveKnowledge(query);
  });

  const response = await handler(jsonRequest({ question: "今天上海天气怎么样？" }), context);
  const payload = (await response.json()) as {
    answer: string;
    retrievalTrace: { candidates: unknown[]; decision: string; mode: string };
    sources: unknown[];
  };

  assert.equal(response.status, 200);
  assert.equal(modelCalls, 0);
  assert.equal(retrieverCalls, 0);
  assert.deepEqual(payload.sources, []);
  assert.equal(payload.retrievalTrace.decision, "blocked-before-retrieval");
  assert.equal(payload.retrievalTrace.mode, "not-run");
  assert.deepEqual(payload.retrievalTrace.candidates, []);
  assert.match(payload.answer, /没有足够信息/);
});

test("POST /api/ask 会把注入的生产检索执行结果连接到公开 trace", async () => {
  const lexical = retrieveKnowledge("个人网站用了哪些技术？", { limit: 3 });
  let retrievalQuery = "";
  const handler = createAskHandler(
    async () => "个人网站使用 React、TypeScript、Vite 和 Tailwind CSS。",
    async (query) => {
      retrievalQuery = query;
      return {
        diagnostics: {
          candidates: lexical.hits.slice(0, 3).map((hit, index) => ({
            scores: { fused: 0.91 - index * 0.1, lexical: hit.coverage, semantic: 0.82 - index * 0.1 },
            selected: true,
            title: hit.entry.title
          })),
          dimensions: 512,
          fallbackReason: "none",
          mode: "hybrid",
          model: "bge-small-zh-v1.5",
          retrievalMs: 18,
          stages: {
            embedding: { durationMs: 12, status: "completed" },
            fallback: { durationMs: 0, status: "skipped" },
            fusion: { durationMs: 1, status: "completed" },
            lexical: { durationMs: 2, status: "completed" },
            semantic: { durationMs: 1, status: "completed" }
          }
        },
        result: lexical
      };
    }
  );

  const response = await handler(
    jsonRequest({ question: "个人网站用了哪些技术？" }, { origin: siteOrigin }),
    context
  );
  const payload = (await response.json()) as {
    retrievalTrace: {
      candidates: unknown[];
      dimensions: number;
      mode: string;
      model: string;
      stages: Array<{ name: string; status: string }>;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(retrievalQuery, "个人网站用了哪些技术？");
  assert.equal(payload.retrievalTrace.mode, "hybrid");
  assert.equal(payload.retrievalTrace.model, "bge-small-zh-v1.5");
  assert.equal(payload.retrievalTrace.dimensions, 512);
  assert.ok(payload.retrievalTrace.candidates.length > 0 && payload.retrievalTrace.candidates.length <= 3);
  assert.ok(payload.retrievalTrace.stages.some((stage) => stage.name === "grounding" && stage.status === "completed"));
});

test("OPTIONS 返回精确 CORS 预检头", async () => {
  const handler = createAskHandler(async () => "不应调用");
  const response = await handler(
    new Request(`${siteOrigin}/api/ask`, {
      headers: { Origin: "https://mrxiaoxies.github.io" },
      method: "OPTIONS"
    }),
    context
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://mrxiaoxies.github.io");
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.equal(response.headers.get("Access-Control-Max-Age"), "600");
});

test("HTTP 边界校验返回稳定错误码", async (t) => {
  const handler = createAskHandler(async () => "不应调用");
  const cases: Array<{
    code: string;
    label: string;
    request: Request;
    status: number;
  }> = [
    {
      code: "cors_forbidden",
      label: "未授权来源",
      request: jsonRequest({ question: "个人网站用了什么技术？" }, { origin: "https://attacker.example" }),
      status: 403
    },
    {
      code: "method_not_allowed",
      label: "错误方法",
      request: new Request(`${siteOrigin}/api/ask`, { method: "GET" }),
      status: 405
    },
    {
      code: "unsupported_media_type",
      label: "错误媒体类型",
      request: new Request(`${siteOrigin}/api/ask`, {
        body: "question=test",
        headers: { "Content-Type": "text/plain" },
        method: "POST"
      }),
      status: 415
    },
    {
      code: "bad_json",
      label: "无效 JSON",
      request: new Request(`${siteOrigin}/api/ask`, {
        body: "{",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      status: 400
    },
    {
      code: "invalid_request",
      label: "无效业务参数",
      request: jsonRequest({ question: "问".repeat(301) }),
      status: 400
    },
    {
      code: "payload_too_large",
      label: "请求体过大",
      request: jsonRequest({ question: "问".repeat(33_000) }),
      status: 413
    }
  ];

  for (const item of cases) {
    await t.test(item.label, async () => {
      const response = await handler(item.request, context);
      const payload = (await response.json()) as { error: { code: string; message: string } };

      assert.equal(response.status, item.status);
      assert.equal(payload.error.code, item.code);
      assert.ok(payload.error.message);
    });
  }
});

test("模型异常不会向客户端泄露原始错误", async (t) => {
  await t.test("普通上游异常", async () => {
    const handler = createAskHandler(async () => {
      throw new Error("secret upstream detail");
    });
    const response = await handler(jsonRequest({ question: "银行客服平台如何定位日志？" }), context);
    const body = await response.text();

    assert.equal(response.status, 502);
    assert.match(body, /model_unavailable/);
    assert.doesNotMatch(body, /secret upstream detail/);
  });

  await t.test("超时异常", async () => {
    const handler = createAskHandler(async () => {
      throw new DOMException("timeout detail", "AbortError");
    });
    const response = await handler(jsonRequest({ question: "银行客服平台如何定位日志？" }), context);
    const body = await response.text();

    assert.equal(response.status, 504);
    assert.match(body, /model_timeout/);
    assert.doesNotMatch(body, /timeout detail/);
  });
});

test("模型适配器只接受完整且非空的 Responses API 输出", () => {
  assert.deepEqual(
    parseGeneratedAnswer({
      output_text: JSON.stringify({
        claims: [{ sourceEntryIds: ["work-overview"], text: "基于公开经历生成的回答。" }]
      }),
      status: "completed"
    }),
    { claims: [{ sourceEntryIds: ["work-overview"], text: "基于公开经历生成的回答。" }] }
  );
  assert.throws(
    () => parseGeneratedAnswer({ output_text: "部分回答", status: "incomplete" }),
    /not completed/
  );
  assert.throws(
    () => parseGeneratedAnswer({ output_text: "   ", status: "completed" }),
    /did not contain text/
  );
  assert.throws(
    () => parseGeneratedAnswer({ output_text: "not json", status: "completed" }),
    /valid JSON/
  );
  assert.throws(
    () =>
      parseGeneratedAnswer({
        output_text: JSON.stringify({ claims: [{ sourceEntryIds: [], text: "无来源" }] }),
        status: "completed"
      }),
    /valid claims/
  );
});
