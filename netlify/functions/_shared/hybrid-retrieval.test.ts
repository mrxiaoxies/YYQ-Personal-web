import assert from "node:assert/strict";
import test from "node:test";

import vectorIndexData from "../../../knowledge/vector-index.json" with { type: "json" };

import { LOCAL_EMBEDDING_DIMENSIONS } from "./embedding.ts";
import {
  createHybridKnowledgeRetriever,
  getHybridRetrievalMetadata,
  type HybridFallbackReason
} from "./hybrid-retrieval.ts";

type TestVectorIndex = typeof vectorIndexData;

function cloneIndex() {
  return structuredClone(vectorIndexData) as TestVectorIndex;
}

function embeddingFor(id: string) {
  const entry = vectorIndexData.entries.find((candidate) => candidate.id === id);
  assert.ok(entry, `Missing vector fixture: ${id}`);
  return Float32Array.from(entry.embedding);
}

function topicEmbeddingFor(id: string) {
  const topic = vectorIndexData.topics.find((candidate) => candidate.id === id);
  assert.ok(topic, `Missing topic vector fixture: ${id}`);
  return Float32Array.from(topic.embedding);
}

function deterministicClock() {
  let current = 0;
  return () => {
    current += 0.25;
    return current;
  };
}

function lowSimilarityEmbedding() {
  const orthonormalBasis: number[][] = [];

  for (const entry of vectorIndexData.entries) {
    const candidate = [...entry.embedding];
    for (const basis of orthonormalBasis) {
      const projection = candidate.reduce((sum, value, index) => sum + value * basis[index], 0);
      for (let index = 0; index < candidate.length; index += 1) {
        candidate[index] -= projection * basis[index];
      }
    }
    const norm = Math.hypot(...candidate);
    if (norm > 1e-8) orthonormalBasis.push(candidate.map((value) => value / norm));
  }

  for (let axis = 0; axis < LOCAL_EMBEDDING_DIMENSIONS; axis += 1) {
    const candidate = Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
    candidate[axis] = 1;
    for (const basis of orthonormalBasis) {
      const projection = candidate.reduce((sum, value, index) => sum + value * basis[index], 0);
      for (let index = 0; index < candidate.length; index += 1) {
        candidate[index] -= projection * basis[index];
      }
    }
    const norm = Math.hypot(...candidate);
    if (norm > 0.1) return Float32Array.from(candidate, (value) => value / norm);
  }

  throw new Error("Could not construct an orthogonal test vector.");
}

test("hybrid retrieval fuses lexical and injected semantic evidence", async () => {
  let embedCalls = 0;
  const retrieve = createHybridKnowledgeRetriever({
    clock: deterministicClock(),
    embedder: async () => {
      embedCalls += 1;
      return embeddingFor("work-overview");
    },
    index: cloneIndex(),
    timeoutMs: 100
  });

  const execution = await retrieve("介绍一下你的工作经历");

  assert.equal(embedCalls, 1);
  assert.equal(execution.diagnostics.mode, "hybrid");
  assert.equal(execution.diagnostics.fallbackReason, "none");
  assert.equal(execution.diagnostics.dimensions, 512);
  assert.equal(execution.diagnostics.stages.lexical.status, "completed");
  assert.equal(execution.diagnostics.stages.embedding.status, "completed");
  assert.equal(execution.diagnostics.stages.semantic.status, "completed");
  assert.equal(execution.diagnostics.stages.fusion.status, "completed");
  assert.equal(execution.diagnostics.stages.fallback.status, "skipped");
  assert.ok(execution.diagnostics.retrievalMs > 0);
  assert.ok(execution.diagnostics.candidates.length <= 3);
  assert.equal(execution.result.accepted, true);
  assert.equal(execution.result.hits[0]?.entry.id, "work-overview");
  assert.equal(execution.diagnostics.candidates[0]?.selected, true);
  assert.equal(typeof execution.diagnostics.candidates[0]?.scores.lexical, "number");
  assert.equal(typeof execution.diagnostics.candidates[0]?.scores.semantic, "number");
  assert.equal(typeof execution.diagnostics.candidates[0]?.scores.fused, "number");
  assert.equal("content" in (execution.diagnostics.candidates[0] ?? {}), false);
});

test("embedding timeout returns the strict lexical result without retrying", async () => {
  let embedCalls = 0;
  const retrieve = createHybridKnowledgeRetriever({
    embedder: () => {
      embedCalls += 1;
      return new Promise<Float32Array>(() => undefined);
    },
    index: cloneIndex(),
    timeoutMs: 5
  });

  const execution = await retrieve("介绍一下你的工作经历");

  assert.equal(embedCalls, 1);
  assert.equal(execution.diagnostics.mode, "lexical-fallback");
  assert.equal(execution.diagnostics.fallbackReason, "embedding-timeout");
  assert.equal(execution.diagnostics.stages.embedding.status, "timed-out");
  assert.equal(execution.diagnostics.stages.fusion.status, "skipped");
  assert.equal(execution.diagnostics.stages.fallback.status, "completed");
  assert.equal(execution.result.accepted, true);
  assert.equal(execution.result.hits[0]?.entry.id, "work-overview");
  assert.equal(
    execution.diagnostics.candidates[0]?.scores.fused,
    Math.round((execution.result.hits[0]?.score ?? 0) * 10) / 1_000
  );
});

test("embedding failure is hidden and safely falls back to lexical retrieval", async () => {
  const retrieve = createHybridKnowledgeRetriever({
    embedder: async () => {
      throw new Error("secret provider details");
    },
    index: cloneIndex()
  });

  const execution = await retrieve("介绍一下你的工作经历");
  const serialized = JSON.stringify(execution.diagnostics);

  assert.equal(execution.diagnostics.mode, "lexical-fallback");
  assert.equal(execution.diagnostics.fallbackReason, "embedding-error");
  assert.equal(execution.diagnostics.stages.embedding.status, "failed");
  assert.doesNotMatch(serialized, /secret provider details/);
  assert.doesNotMatch(serialized, /queryEmbedding|documentEmbeddings/);
});

test("hybrid retrieval passes packaged topic vectors into broad topic aggregation", async () => {
  const retrieve = createHybridKnowledgeRetriever({
    embedder: async () => topicEmbeddingFor("work-experience"),
    index: cloneIndex()
  });

  const execution = await retrieve("职业路线是怎么一路走过来的");

  assert.equal(execution.diagnostics.mode, "hybrid");
  assert.equal(execution.result.accepted, true);
  assert.equal(execution.result.topic?.id, "work-experience");
  assert.equal(execution.result.topic?.mode, "overview");
  assert.ok((execution.result.topic?.evidenceCount ?? 0) >= 2);
  assert.equal(execution.diagnostics.topic?.title, "工作经验公开概括");
  assert.equal(execution.diagnostics.topic?.evidenceCount, execution.result.topic?.evidenceCount);
  assert.doesNotMatch(JSON.stringify(execution.diagnostics), /从 2018 年开始|topicEmbeddings|employmentPeriods/);
});

const invalidIndexCases: Array<{
  mutate: (index: TestVectorIndex) => unknown;
  reason: HybridFallbackReason;
}> = [
  {
    mutate: (index) => ({ ...index, schemaVersion: 1 }),
    reason: "index-schema-invalid"
  },
  {
    mutate: (index) => ({ ...index, model: "another-model" }),
    reason: "index-model-mismatch"
  },
  {
    mutate: (index) => ({ ...index, dimension: 384 }),
    reason: "index-dimension-mismatch"
  },
  {
    mutate: (index) => ({ ...index, knowledgeVersion: "stale-version" }),
    reason: "index-knowledge-version-mismatch"
  },
  {
    mutate: (index) => ({ ...index, entryCount: index.entryCount - 1 }),
    reason: "index-entry-count-mismatch"
  },
  {
    mutate: (index) => {
      index.entries[0].id = "unknown-entry";
      return index;
    },
    reason: "index-entry-id-mismatch"
  },
  {
    mutate: (index) => {
      index.entries[0].embedding = index.entries[0].embedding.slice(1);
      return index;
    },
    reason: "index-vector-invalid"
  },
  {
    mutate: (index) => ({ ...index, topicCount: index.topicCount - 1 }),
    reason: "index-topic-count-mismatch"
  },
  {
    mutate: (index) => {
      index.topics[0].id = "unknown-topic";
      return index;
    },
    reason: "index-topic-id-mismatch"
  },
  {
    mutate: (index) => {
      index.topics[0].embedding = index.topics[0].embedding.slice(1);
      return index;
    },
    reason: "index-topic-vector-invalid"
  }
];

for (const { mutate, reason } of invalidIndexCases) {
  test(`invalid vector index (${reason}) bypasses the embedder`, async () => {
    let embedCalls = 0;
    const retrieve = createHybridKnowledgeRetriever({
      embedder: async () => {
        embedCalls += 1;
        return embeddingFor("work-overview");
      },
      index: mutate(cloneIndex())
    });

    const execution = await retrieve("介绍一下你的工作经历");

    assert.equal(embedCalls, 0);
    assert.equal(execution.diagnostics.mode, "lexical-fallback");
    assert.equal(execution.diagnostics.fallbackReason, reason);
    assert.equal(execution.diagnostics.stages.embedding.status, "skipped");
    assert.equal(execution.diagnostics.stages.semantic.status, "failed");
    assert.equal(execution.result.accepted, true);
  });
}

test("an invalid query vector falls back without exposing vector values", async () => {
  const retrieve = createHybridKnowledgeRetriever({
    embedder: async () => new Float32Array(384).fill(1),
    index: cloneIndex()
  });

  const execution = await retrieve("介绍一下你的工作经历");

  assert.equal(execution.diagnostics.fallbackReason, "query-vector-invalid");
  assert.equal(execution.diagnostics.stages.embedding.status, "failed");
  assert.ok(JSON.stringify(execution.diagnostics).length < 3_000);
});

test("an unknown personal-experience question remains rejected with weak semantic evidence", async () => {
  const retrieve = createHybridKnowledgeRetriever({
    embedder: async () => lowSimilarityEmbedding(),
    index: cloneIndex()
  });

  const execution = await retrieve("请说说你的量子纠缠芯片调试经历");

  assert.equal(execution.diagnostics.mode, "hybrid");
  assert.equal(execution.diagnostics.fallbackReason, "none");
  assert.equal(execution.result.accepted, false);
  assert.equal(execution.result.hits.length, 0);
  assert.equal(execution.diagnostics.candidates.length, 0);
});

test("an empty query stays lexical and never starts the embedder", async () => {
  let embedCalls = 0;
  const retrieve = createHybridKnowledgeRetriever({
    embedder: async () => {
      embedCalls += 1;
      return embeddingFor("profile-overview");
    },
    index: cloneIndex()
  });

  const execution = await retrieve("   ");

  assert.equal(embedCalls, 0);
  assert.equal(execution.diagnostics.mode, "lexical");
  assert.equal(execution.diagnostics.fallbackReason, "none");
  assert.equal(execution.diagnostics.stages.embedding.status, "skipped");
  assert.equal(execution.result.reason, "no-meaningful-query");
});

test("static hybrid metadata validates the packaged index without loading the model", () => {
  const metadata = getHybridRetrievalMetadata();

  assert.equal(metadata.dimensions, 512);
  assert.equal(metadata.fallbackReason, "none");
  assert.equal(metadata.indexEntryCount, 16);
  assert.equal(metadata.indexTopicCount, 5);
  assert.equal(metadata.indexReady, true);
  assert.equal(metadata.knowledgeVersion, "1.3.0");
  assert.equal(metadata.mode, "hybrid");
  assert.equal(metadata.model, "bge-small-zh-v1.5");
});
