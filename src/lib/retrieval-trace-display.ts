import type { KnowledgeRetrievalTrace } from "./knowledge-chat";

type FallbackDisplayTrace = Pick<KnowledgeRetrievalTrace, "mode" | "stages">;
type TopicDisplayTrace = Pick<
  KnowledgeRetrievalTrace,
  "factDerivationTypes" | "topicEvidenceCount" | "topicTitle"
>;

const factTypeLabels: Record<NonNullable<KnowledgeRetrievalTrace["factDerivationTypes"]>[number], string> = {
  compare: "阶段比较",
  count: "证据计数",
  duration: "时间计算",
  group: "资料分组",
  link: "实体关联",
  summarize: "跨资料概括"
};

export function shouldShowRetrievalFallback(trace: FallbackDisplayTrace) {
  if (trace.mode === "lexical-fallback") return true;

  const fallbackStage = trace.stages.find((stage) => stage.name === "fallback");
  return fallbackStage !== undefined && fallbackStage.status !== "skipped";
}

export function buildRetrievalSummaryBadges(trace: TopicDisplayTrace) {
  return [
    trace.topicTitle ? `主题 ${trace.topicTitle}` : undefined,
    trace.topicEvidenceCount ? `聚合 ${trace.topicEvidenceCount} 条公开证据` : undefined,
    trace.factDerivationTypes?.length
      ? `事实推导 ${trace.factDerivationTypes.map((type) => factTypeLabels[type]).join("、")}`
      : undefined
  ].filter((badge): badge is string => Boolean(badge));
}
