import assert from "node:assert/strict";
import { answerKnowledgeQuestion } from "../netlify/functions/_shared/ask-core.ts";
import { embedKnowledgeQuery } from "../netlify/functions/_shared/embedding.ts";
import { retrieveKnowledge, SEMANTIC_EMBEDDING_MODEL, SEMANTIC_EMBEDDING_DIMENSIONS } from "../netlify/functions/_shared/retrieval.ts";
import vectorIndex from "../knowledge/vector-index.json" with { type: "json" };

console.log("真实 BGE Wiki 评测：对完整回答流程使用实际查询向量；模型生成用来源回显，单独验证证据规划。");
const retrieve = async query => {
  const embedding = await embedKnowledgeQuery(query);
  return retrieveKnowledge(query, { semantic: { queryEmbedding: embedding, documentEmbeddings: Object.fromEntries(vectorIndex.entries.map(item => [item.id, item.embedding])), topicEmbeddings: Object.fromEntries(vectorIndex.topics.map(item => [item.id, item.embedding])), dimensions: SEMANTIC_EMBEDDING_DIMENSIONS, knowledgeVersion: vectorIndex.knowledgeVersion, model: SEMANTIC_EMBEDDING_MODEL } });
};
const cases = [
  ["个人网站与微信 AI 好友有什么共同点和差异？", ["个人网站与 Codex 维护工作流", "微信 AI 好友本地工作流"]],
  ["哪些项目体现了你的 Linux 经验？", ["自研边缘化 AI 工控机测试", "广告机不同型号灰盒测试"]],
  ["养老金项目用了 Codex 吗？", []],
  ["你会 Selenium 吗？", []],
  ["你什么时候开始学习 RAG？", []]
];
for (const [question, titles] of cases) {
  const result = await answerKnowledgeQuestion({ question }, async input => ({ claims: JSON.parse(input.evidence).map(entry => ({text: entry.content, sourceEntryIds: [entry.source_id]})) }), retrieve);
  if (!titles.length) assert.equal(result.sources.length, 0, question);
  else for (const title of titles) assert.ok(result.sources.some(source => source.title === title), `${question} 缺少 ${title}`);
  console.log(`通过：${question}`);
}
