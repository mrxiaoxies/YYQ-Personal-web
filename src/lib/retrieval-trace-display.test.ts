import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetrievalSummaryBadges,
  shouldShowRetrievalFallback
} from "./retrieval-trace-display.ts";

test("混合检索中的 skipped fallback 不会误显示为自动降级", () => {
  assert.equal(
    shouldShowRetrievalFallback({
      mode: "hybrid",
      stages: [{ name: "fallback", status: "skipped" }]
    }),
    false
  );
});

test("真正的关键词降级和失败 fallback 仍会展示提示", () => {
  assert.equal(
    shouldShowRetrievalFallback({
      mode: "lexical-fallback",
      stages: [{ name: "fallback", status: "completed" }]
    }),
    true
  );
  assert.equal(
    shouldShowRetrievalFallback({
      mode: "hybrid",
      stages: [{ name: "fallback", status: "failed" }]
    }),
    true
  );
});

test("主题聚合轨迹只展示安全概括，不暴露事实值和来源 ID", () => {
  const badges = buildRetrievalSummaryBadges({
    factDerivationTypes: ["duration", "count", "summarize"],
    topicEvidenceCount: 6,
    topicTitle: "工作经验公开概括"
  });
  const serialized = badges.join(" ");

  assert.deepEqual(badges, [
    "主题 工作经验公开概括",
    "聚合 6 条公开证据",
    "事实推导 时间计算、证据计数、跨资料概括"
  ]);
  assert.doesNotMatch(serialized, /work-overview|8 年 7 个月|sourceEntryIds/);
});
