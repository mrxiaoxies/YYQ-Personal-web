import assert from "node:assert/strict";
import test from "node:test";
import { answerKnowledgeQuestion } from "./ask-core.ts";

test("项目比较给模型两侧原始证据和 Wiki 组织上下文", async () => {
  const answer = await answerKnowledgeQuestion({ question: "个人网站与微信 AI 好友有什么共同点和差异？" }, async input => {
    const evidence = JSON.parse(input.evidence);
    assert.ok(evidence.some((item: { source_id: string }) => item.source_id === "project-personal-site"));
    assert.ok(evidence.some((item: { source_id: string }) => item.source_id === "project-wechat-ai"));
    assert.ok(input.wikiContext);
    return { claims: [{ text: "两个项目均体现了个人 AI 工作流实践。", sourceEntryIds: ["project-personal-site", "project-wechat-ai"] }] };
  });
  assert.equal(answer.retrievalTrace.decision, "answered");
  assert.equal(answer.sources.length, 2);
});

test("未知技能与无证据的学习日期不会由 Wiki 补成事实", async () => {
  for (const question of ["个人网站与微信 AI 好友都用了 Selenium 吗？", "养老金项目用 Codex 吗？", "你什么时候开始学习 RAG？"]) {
    const result = await answerKnowledgeQuestion({ question }, async () => { throw new Error("不得调用模型"); });
    assert.notEqual(result.retrievalTrace.decision, "answered");
    assert.deepEqual(result.sources, []);
  }
});

test("模型只回答比较的一侧时不得标记已完成比较", async () => {
  const result = await answerKnowledgeQuestion({ question: "个人网站与微信 AI 好友有什么共同点和差异？" }, async () => ({ claims: [{ text: "个人网站使用 React。", sourceEntryIds: ["project-personal-site"] }] }));
  assert.equal(result.retrievalTrace.decision, "insufficient-evidence");
  assert.deepEqual(result.sources, []);
});
