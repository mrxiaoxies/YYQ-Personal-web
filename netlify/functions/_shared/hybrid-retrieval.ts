import vectorIndexData from "../../../knowledge/vector-index.json" with { type: "json" };

import { publicEntries, publicTopics } from "./knowledge-data.ts";
import {
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  embedKnowledgeQuery
} from "./embedding.ts";
import {
  getKnowledgeMetadata,
  retrieveKnowledge,
  type EmbeddingVector,
  type RetrievalResult
} from "./retrieval.ts";

export const HYBRID_EMBEDDING_TIMEOUT_MS = 2_500;

export type HybridRetrievalMode = "hybrid" | "lexical-fallback" | "lexical";

export type HybridFallbackReason =
  | "none"
  | "index-schema-invalid"
  | "index-model-mismatch"
  | "index-dimension-mismatch"
  | "index-knowledge-version-mismatch"
  | "index-entry-count-mismatch"
  | "index-entry-id-mismatch"
  | "index-vector-invalid"
  | "index-topic-count-mismatch"
  | "index-topic-id-mismatch"
  | "index-topic-vector-invalid"
  | "embedding-timeout"
  | "embedding-error"
  | "query-vector-invalid"
  | "fusion-error";

export type HybridRetrievalStageStatus = "completed" | "skipped" | "failed" | "timed-out";

export type HybridRetrievalStage = {
  durationMs: number;
  status: HybridRetrievalStageStatus;
};

export type HybridRetrievalCandidate = {
  scores: {
    fused: number | null;
    lexical: number | null;
    semantic: number | null;
  };
  selected: boolean;
  title: string;
};

export type HybridRetrievalDiagnostics = {
  candidates: HybridRetrievalCandidate[];
  dimensions: number;
  fallbackReason: HybridFallbackReason;
  mode: HybridRetrievalMode;
  model: string;
  retrievalMs: number;
  stages: {
    embedding: HybridRetrievalStage;
    fallback: HybridRetrievalStage;
    fusion: HybridRetrievalStage;
    lexical: HybridRetrievalStage;
    semantic: HybridRetrievalStage;
  };
  topic?: {
    evidenceCount: number;
    score: number;
    title: string;
  };
};

export type HybridRetrievalExecution = {
  diagnostics: HybridRetrievalDiagnostics;
  result: RetrievalResult;
};

export type HybridRetrievalMetadata = {
  dimensions: number;
  fallbackReason: HybridFallbackReason;
  indexEntryCount: number;
  indexTopicCount: number;
  indexReady: boolean;
  knowledgeVersion: string;
  mode: "hybrid" | "lexical-fallback";
  model: string;
};

type VectorIndexEntry = {
  embedding: number[];
  id: string;
};

type ValidatedVectorIndex = {
  documentEmbeddings: Readonly<Record<string, readonly number[]>>;
  entryCount: number;
  knowledgeVersion: string;
  topicCount: number;
  topicEmbeddings: Readonly<Record<string, readonly number[]>>;
};

type VectorIndexValidation =
  | { index: ValidatedVectorIndex; valid: true }
  | { reason: Exclude<HybridFallbackReason, "none" | "embedding-timeout" | "embedding-error" | "query-vector-invalid" | "fusion-error">; valid: false };

export type HybridKnowledgeRetrieverOptions = {
  clock?: () => number;
  embedder?: (query: string) => Promise<EmbeddingVector>;
  index?: unknown;
  timeoutMs?: number;
};

const completedStage = (): HybridRetrievalStage => ({ durationMs: 0, status: "completed" });
const skippedStage = (): HybridRetrievalStage => ({ durationMs: 0, status: "skipped" });

class EmbeddingTimeoutError extends Error {
  constructor() {
    super("embedding-timeout");
    this.name = "EmbeddingTimeoutError";
  }
}

function durationSince(clock: () => number, startedAt: number) {
  return Math.max(0, Math.round((clock() - startedAt) * 1_000) / 1_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedPublicEntryIds() {
  return publicEntries.map((entry) => entry.id).sort();
}

function expectedPublicTopicIds() {
  return publicTopics.map((topic) => topic.id).sort();
}

function validateVectorIndex(value: unknown): VectorIndexValidation {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.topics)
  ) {
    return { reason: "index-schema-invalid", valid: false };
  }

  if (value.model !== LOCAL_EMBEDDING_MODEL) {
    return { reason: "index-model-mismatch", valid: false };
  }

  if (value.dimension !== LOCAL_EMBEDDING_DIMENSIONS) {
    return { reason: "index-dimension-mismatch", valid: false };
  }

  const metadata = getKnowledgeMetadata();
  if (value.knowledgeVersion !== metadata.version) {
    return { reason: "index-knowledge-version-mismatch", valid: false };
  }

  const expectedIds = expectedPublicEntryIds();
  if (
    value.entryCount !== expectedIds.length ||
    value.entries.length !== expectedIds.length
  ) {
    return { reason: "index-entry-count-mismatch", valid: false };
  }

  const entries = value.entries as unknown[];
  const ids = entries
    .map((entry) => (isRecord(entry) && typeof entry.id === "string" ? entry.id : ""))
    .sort();
  if (
    ids.some((id) => !id) ||
    new Set(ids).size !== ids.length ||
    ids.some((id, index) => id !== expectedIds[index])
  ) {
    return { reason: "index-entry-id-mismatch", valid: false };
  }

  const documentEmbeddings: Record<string, readonly number[]> = {};
  for (const rawEntry of entries) {
    const entry = rawEntry as Partial<VectorIndexEntry>;
    if (
      typeof entry.id !== "string" ||
      !Array.isArray(entry.embedding) ||
      entry.embedding.length !== LOCAL_EMBEDDING_DIMENSIONS ||
      entry.embedding.some((component) => !Number.isFinite(component)) ||
      entry.embedding.every((component) => component === 0)
    ) {
      return { reason: "index-vector-invalid", valid: false };
    }
    documentEmbeddings[entry.id] = entry.embedding;
  }

  const expectedTopicIds = expectedPublicTopicIds();
  if (value.topicCount !== expectedTopicIds.length || value.topics.length !== expectedTopicIds.length) {
    return { reason: "index-topic-count-mismatch", valid: false };
  }
  const rawTopics = value.topics as unknown[];
  const topicIds = rawTopics
    .map((topic) => (isRecord(topic) && typeof topic.id === "string" ? topic.id : ""))
    .sort();
  if (
    topicIds.some((id) => !id) ||
    new Set(topicIds).size !== topicIds.length ||
    topicIds.some((id, index) => id !== expectedTopicIds[index])
  ) {
    return { reason: "index-topic-id-mismatch", valid: false };
  }
  const topicEmbeddings: Record<string, readonly number[]> = {};
  for (const rawTopic of rawTopics) {
    const topic = rawTopic as Partial<VectorIndexEntry>;
    if (
      typeof topic.id !== "string" ||
      !Array.isArray(topic.embedding) ||
      topic.embedding.length !== LOCAL_EMBEDDING_DIMENSIONS ||
      topic.embedding.some((component) => !Number.isFinite(component)) ||
      topic.embedding.every((component) => component === 0)
    ) {
      return { reason: "index-topic-vector-invalid", valid: false };
    }
    topicEmbeddings[topic.id] = topic.embedding;
  }

  return {
    index: {
      documentEmbeddings,
      entryCount: expectedIds.length,
      knowledgeVersion: metadata.version,
      topicCount: expectedTopicIds.length,
      topicEmbeddings
    },
    valid: true
  };
}

function validateQueryEmbedding(value: EmbeddingVector): value is EmbeddingVector {
  if (value.length !== LOCAL_EMBEDDING_DIMENSIONS) return false;

  let hasMagnitude = false;
  for (const component of value) {
    if (!Number.isFinite(component)) return false;
    if (component !== 0) hasMagnitude = true;
  }
  return hasMagnitude;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new EmbeddingTimeoutError()), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function roundScore(value: number | undefined) {
  return value === undefined ? null : Math.round(value * 1_000) / 1_000;
}

function buildCandidates(
  result: RetrievalResult,
  lexicalResult: RetrievalResult
): HybridRetrievalCandidate[] {
  const lexicalHits = new Map(lexicalResult.hits.map((hit) => [hit.entry.id, hit]));
  const finalHits = new Map(result.hits.map((hit) => [hit.entry.id, hit]));
  const orderedHits = [...result.hits, ...lexicalResult.hits].filter(
    (hit, index, hits) => hits.findIndex((candidate) => candidate.entry.id === hit.entry.id) === index
  );

  return orderedHits.slice(0, 3).map((hit) => {
    const lexicalHit = lexicalHits.get(hit.entry.id);
    const finalHit = finalHits.get(hit.entry.id);
    return {
      scores: {
        fused: finalHit ? roundScore(finalHit.score / 100) : null,
        lexical: roundScore(lexicalHit?.coverage),
        semantic: roundScore(finalHit?.semanticSimilarity)
      },
      selected: result.accepted && finalHits.has(hit.entry.id),
      title: hit.entry.title
    };
  });
}

function createDiagnostics(
  mode: HybridRetrievalMode,
  fallbackReason: HybridFallbackReason,
  stages: HybridRetrievalDiagnostics["stages"],
  result: RetrievalResult,
  lexicalResult: RetrievalResult,
  retrievalMs: number
): HybridRetrievalDiagnostics {
  return {
    candidates: buildCandidates(result, lexicalResult),
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    fallbackReason,
    mode,
    model: LOCAL_EMBEDDING_MODEL,
    retrievalMs,
    stages,
    ...(result.topic
      ? {
          topic: {
            evidenceCount: result.topic.evidenceCount,
            score: roundScore(result.topic.score) ?? 0,
            title: result.topic.title
          }
        }
      : {})
  };
}

function lexicalExecution(
  result: RetrievalResult,
  stages: HybridRetrievalDiagnostics["stages"],
  clock: () => number,
  retrievalStartedAt: number
): HybridRetrievalExecution {
  return {
    diagnostics: createDiagnostics(
      "lexical",
      "none",
      stages,
      result,
      result,
      durationSince(clock, retrievalStartedAt)
    ),
    result
  };
}

function fallbackExecution(
  result: RetrievalResult,
  reason: Exclude<HybridFallbackReason, "none">,
  stages: HybridRetrievalDiagnostics["stages"],
  clock: () => number,
  retrievalStartedAt: number
): HybridRetrievalExecution {
  const fallbackStartedAt = clock();
  stages.fallback = completedStage();
  stages.fallback.durationMs = durationSince(clock, fallbackStartedAt);

  return {
    diagnostics: createDiagnostics(
      "lexical-fallback",
      reason,
      stages,
      result,
      result,
      durationSince(clock, retrievalStartedAt)
    ),
    result
  };
}

export function createHybridKnowledgeRetriever(options: HybridKnowledgeRetrieverOptions = {}) {
  const clock = options.clock ?? performance.now.bind(performance);
  const embedder = options.embedder ?? embedKnowledgeQuery;
  const sourceIndex = options.index ?? vectorIndexData;
  const timeoutMs = Math.max(1, options.timeoutMs ?? HYBRID_EMBEDDING_TIMEOUT_MS);

  return async function hybridKnowledgeRetriever(query: string): Promise<HybridRetrievalExecution> {
    const retrievalStartedAt = clock();
    const stages: HybridRetrievalDiagnostics["stages"] = {
      embedding: skippedStage(),
      fallback: skippedStage(),
      fusion: skippedStage(),
      lexical: skippedStage(),
      semantic: skippedStage()
    };

    const lexicalStartedAt = clock();
    const lexicalResult = retrieveKnowledge(query, { limit: 3 });
    stages.lexical = completedStage();
    stages.lexical.durationMs = durationSince(clock, lexicalStartedAt);

    if (lexicalResult.reason === "no-meaningful-query") {
      return lexicalExecution(lexicalResult, stages, clock, retrievalStartedAt);
    }

    const indexValidationStartedAt = clock();
    const indexValidation = validateVectorIndex(sourceIndex);
    if (!indexValidation.valid) {
      stages.semantic = {
        durationMs: durationSince(clock, indexValidationStartedAt),
        status: "failed"
      };
      return fallbackExecution(
        lexicalResult,
        indexValidation.reason,
        stages,
        clock,
        retrievalStartedAt
      );
    }

    const embeddingStartedAt = clock();
    let queryEmbedding: EmbeddingVector;
    try {
      queryEmbedding = await withTimeout(Promise.resolve().then(() => embedder(query)), timeoutMs);
      stages.embedding = completedStage();
      stages.embedding.durationMs = durationSince(clock, embeddingStartedAt);
    } catch (error) {
      const timedOut = error instanceof EmbeddingTimeoutError;
      stages.embedding = {
        durationMs: durationSince(clock, embeddingStartedAt),
        status: timedOut ? "timed-out" : "failed"
      };
      return fallbackExecution(
        lexicalResult,
        timedOut ? "embedding-timeout" : "embedding-error",
        stages,
        clock,
        retrievalStartedAt
      );
    }

    if (!validateQueryEmbedding(queryEmbedding)) {
      stages.embedding.status = "failed";
      return fallbackExecution(
        lexicalResult,
        "query-vector-invalid",
        stages,
        clock,
        retrievalStartedAt
      );
    }

    const semanticStartedAt = clock();
    const semanticInput = {
      dimensions: LOCAL_EMBEDDING_DIMENSIONS,
      documentEmbeddings: indexValidation.index.documentEmbeddings,
      knowledgeVersion: indexValidation.index.knowledgeVersion,
      model: LOCAL_EMBEDDING_MODEL,
      queryEmbedding,
      topicEmbeddings: indexValidation.index.topicEmbeddings
    };
    stages.semantic = {
      durationMs: durationSince(clock, semanticStartedAt),
      status: "completed"
    };

    const fusionStartedAt = clock();
    let result: RetrievalResult;
    try {
      result = retrieveKnowledge(query, {
        limit: 3,
        semantic: semanticInput
      });
      stages.fusion = {
        durationMs: durationSince(clock, fusionStartedAt),
        status: "completed"
      };
    } catch {
      stages.fusion = {
        durationMs: durationSince(clock, fusionStartedAt),
        status: "failed"
      };
      return fallbackExecution(
        lexicalResult,
        "fusion-error",
        stages,
        clock,
        retrievalStartedAt
      );
    }

    return {
      diagnostics: createDiagnostics(
        "hybrid",
        "none",
        stages,
        result,
        lexicalResult,
        durationSince(clock, retrievalStartedAt)
      ),
      result
    };
  };
}

const defaultHybridKnowledgeRetriever = createHybridKnowledgeRetriever();

export function retrieveKnowledgeHybrid(query: string) {
  return defaultHybridKnowledgeRetriever(query);
}

export function getHybridRetrievalMetadata(): HybridRetrievalMetadata {
  const validation = validateVectorIndex(vectorIndexData);
  const metadata = getKnowledgeMetadata();

  return {
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    fallbackReason: validation.valid ? "none" : validation.reason,
    indexEntryCount: validation.valid ? validation.index.entryCount : 0,
    indexTopicCount: validation.valid ? validation.index.topicCount : 0,
    indexReady: validation.valid,
    knowledgeVersion: metadata.version,
    mode: validation.valid ? "hybrid" : "lexical-fallback",
    model: LOCAL_EMBEDDING_MODEL
  };
}
