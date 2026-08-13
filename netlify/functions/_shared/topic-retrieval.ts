import type { EmbeddingVector } from "./retrieval.ts";
import type { KnowledgeTopic } from "./knowledge-schema.ts";

export const TOPIC_SCORE_WEIGHTS = {
  childSupport: 0.15,
  evidenceCoverage: 0.1,
  lexical: 0.3,
  semantic: 0.45
} as const;

export const MIN_HYBRID_TOPIC_SCORE = 0.46;
export const MIN_LEXICAL_TOPIC_SCORE = 0.38;

export type TopicEvidenceSignal = {
  entryId: string;
  lexical: number;
  semantic?: number;
  valid: boolean;
};

export type TopicSemanticInput = {
  queryEmbedding: EmbeddingVector;
  topicEmbeddings: Readonly<Record<string, EmbeddingVector>>;
};

export type TopicMatch = {
  accepted: boolean;
  components: {
    childSupport: number;
    evidenceCoverage: number;
    lexical: number;
    semantic: number;
  };
  evidenceCount: number;
  score: number;
  topic: KnowledgeTopic;
};

export type RankKnowledgeTopicsInput = {
  evidence: TopicEvidenceSignal[];
  query: string;
  semantic?: TopicSemanticInput;
  topics: KnowledgeTopic[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function compact(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(value: string) {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
  return result;
}

function lexicalRelevance(query: string, topic: KnowledgeTopic) {
  const normalizedQuery = compact(query);
  const anchors = topic.lexicalAnchors.map(compact).filter(Boolean);
  if (!normalizedQuery || anchors.length === 0) return 0;
  const containedAnchors = anchors.filter((anchor) => normalizedQuery.includes(anchor));
  if (containedAnchors.length > 0) {
    const longestMatch = Math.max(...containedAnchors.map((anchor) => anchor.length));
    const longestTopicAnchor = Math.max(...anchors.map((anchor) => anchor.length));
    // A full topic phrase (for example “测试工具”) carries more evidence than its short
    // overlapping token (“测试”). This is a fixed additive component, not a pairwise margin.
    return clamp(0.5 + 0.5 * (longestMatch / longestTopicAnchor));
  }

  const queryBigrams = bigrams(normalizedQuery);
  return clamp(
    Math.max(
      0,
      ...anchors.map((anchor) => {
        const anchorBigrams = bigrams(anchor);
        if (anchorBigrams.size === 0) return normalizedQuery.includes(anchor) ? 1 : 0;
        const matches = [...anchorBigrams].filter((gram) => queryBigrams.has(gram)).length;
        return matches / anchorBigrams.size;
      })
    )
  );
}

function cosine(left: EmbeddingVector, right: EmbeddingVector) {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function semanticRelevance(topic: KnowledgeTopic, semantic: TopicSemanticInput | undefined) {
  const topicEmbedding = semantic?.topicEmbeddings[topic.id];
  if (!semantic || !topicEmbedding) return 0;
  return clamp((cosine(semantic.queryEmbedding, topicEmbedding) - 0.35) / 0.35);
}

export function rankKnowledgeTopics(input: RankKnowledgeTopicsInput): TopicMatch[] {
  return input.topics
    .map((topic) => {
      const topicEvidence = input.evidence.filter(
        (item) => item.valid && topic.entryIds.includes(item.entryId)
      );
      const evidenceCount = new Set(topicEvidence.map((item) => item.entryId)).size;
      const strongest = topicEvidence
        .map((item) => Math.max(clamp(item.lexical), clamp(item.semantic ?? 0)))
        .sort((left, right) => right - left)
        .slice(0, 2);
      const components = {
        childSupport: strongest.length
          ? clamp(strongest.reduce((sum, value) => sum + value, 0) / strongest.length)
          : 0,
        evidenceCoverage: clamp(evidenceCount / 3),
        lexical: lexicalRelevance(input.query, topic),
        semantic: semanticRelevance(topic, input.semantic)
      };
      const score = round(
        components.semantic * TOPIC_SCORE_WEIGHTS.semantic +
          components.lexical * TOPIC_SCORE_WEIGHTS.lexical +
          components.childSupport * TOPIC_SCORE_WEIGHTS.childSupport +
          components.evidenceCoverage * TOPIC_SCORE_WEIGHTS.evidenceCoverage
      );
      const threshold = input.semantic ? MIN_HYBRID_TOPIC_SCORE : MIN_LEXICAL_TOPIC_SCORE;
      const overviewSupported = Boolean(
        topic.overviewEntryId && topicEvidence.some((item) => item.entryId === topic.overviewEntryId)
      );

      return {
        // 宽泛问题按绝对证据强度判断；第二个相关主题不应仅因 margin 很小而把正确总览否决。
        accepted: score >= threshold && (evidenceCount >= 2 || overviewSupported),
        components: {
          childSupport: round(components.childSupport),
          evidenceCoverage: round(components.evidenceCoverage),
          lexical: round(components.lexical),
          semantic: round(components.semantic)
        },
        evidenceCount,
        score,
        topic
      } satisfies TopicMatch;
    })
    .sort((left, right) => right.score - left.score || left.topic.id.localeCompare(right.topic.id));
}
