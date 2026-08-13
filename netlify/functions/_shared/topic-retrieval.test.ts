import assert from "node:assert/strict";
import test from "node:test";

import { rankKnowledgeTopics } from "./topic-retrieval.ts";
import type { KnowledgeTopic } from "./knowledge-schema.ts";

const testingTopic: KnowledgeTopic = {
  category: "skill",
  description: "公开的软件测试方法、接口数据验证和环境排查能力。",
  entryIds: ["skill-testing-methods", "skill-api-data-environment"],
  id: "testing-skills",
  lexicalAnchors: ["测试", "测试技能", "测试能力"],
  title: "测试技能公开概括"
};

test("宽泛主题分数会相加语义、词法、子知识和证据覆盖", () => {
  const [match] = rankKnowledgeTopics({
    evidence: [
      { entryId: "skill-testing-methods", lexical: 0.8, semantic: 0.7, valid: true },
      { entryId: "skill-api-data-environment", lexical: 0.6, semantic: 0.6, valid: true }
    ],
    query: "介绍一下你的测试能力",
    semantic: { queryEmbedding: [1, 0], topicEmbeddings: { "testing-skills": [1, 0] } },
    topics: [testingTopic]
  });

  assert.equal(match.topic.id, "testing-skills");
  assert.equal(match.accepted, true);
  assert.equal(match.evidenceCount, 2);
  assert.deepEqual(match.components, {
    childSupport: 0.7,
    evidenceCoverage: 0.666667,
    lexical: 1,
    semantic: 1
  });
  assert.equal(match.score, 0.921667);
});

test("两个相近主题不会通过首二名差值否决各自的绝对证据", () => {
  const secondTopic = { ...testingTopic, id: "testing-neighbor", title: "邻近测试主题" };
  const matches = rankKnowledgeTopics({
    evidence: [
      { entryId: "skill-testing-methods", lexical: 0.8, semantic: 0.8, valid: true },
      { entryId: "skill-api-data-environment", lexical: 0.7, semantic: 0.7, valid: true }
    ],
    query: "测试能力有哪些",
    semantic: {
      queryEmbedding: [1, 0],
      topicEmbeddings: { "testing-skills": [1, 0], "testing-neighbor": [0.999, 0.045] }
    },
    topics: [testingTopic, secondTopic]
  });

  assert.equal(matches[0].accepted, true);
  assert.equal(matches[1].accepted, true);
  assert.ok(matches[0].score - matches[1].score < 0.01);
});

test("单条弱证据和无主题词问法不会触发宽泛回答", () => {
  const weak = rankKnowledgeTopics({
    evidence: [{ entryId: "skill-testing-methods", lexical: 0.2, semantic: 0.3, valid: true }],
    query: "说说情况",
    topics: [testingTopic]
  });
  assert.equal(weak[0].accepted, false);

  const unrelated = rankKnowledgeTopics({
    evidence: [
      { entryId: "skill-testing-methods", lexical: 0.8, valid: true },
      { entryId: "skill-api-data-environment", lexical: 0.8, valid: true }
    ],
    query: "今天天气怎么样",
    topics: [testingTopic]
  });
  assert.equal(unrelated[0].accepted, false);
});

test("词法降级在两条有效证据支持下可以通过固定绝对阈值", () => {
  const [match] = rankKnowledgeTopics({
    evidence: [
      { entryId: "skill-testing-methods", lexical: 0.8, valid: true },
      { entryId: "skill-api-data-environment", lexical: 0.7, valid: true }
    ],
    query: "你有哪些测试技能",
    topics: [testingTopic]
  });

  assert.equal(match.accepted, true);
  assert.equal(match.components.semantic, 0);
  assert.ok(match.score >= 0.38);
  assert.equal(Object.values(match.components).every((value) => value >= 0 && value <= 1), true);
});
