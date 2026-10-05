import assert from "node:assert/strict";
import test from "node:test";
import { answerKnowledgeQuestion } from "./ask-core.ts";

test("新项目可以通过公开经历问答检索，保留来源与状态", async () => {
  for (const [question, title] of [
    ["你的钓鱼游戏目前做到什么阶段？", "Slow Jigging 钓鱼游戏"],
    ["你的3D户型建模项目目前进展如何？", "3D 户型建模与方案迭代"],
    ["你做的磁盘空间诊断完成了什么？", "Windows 磁盘空间诊断"],
    ["你做的视频话术整理有哪些操作？", "视频话术与文档整理"],
    ["你的RAG知识库项目做了什么？", "RAG 知识库与问答"]
  ]) {
    const result = await answerKnowledgeQuestion({ question }, async input => {
      const entries = JSON.parse(input.evidence);
      return { claims: entries.map((entry: { content: string; source_id: string }) => ({ text: entry.content, sourceEntryIds: [entry.source_id] })) };
    });
    assert.equal(result.retrievalTrace.decision, "answered", question);
    assert.ok(result.sources.some(source => source.title === title), question);
  }
});

test("游戏项目问答不放行新闻、私密住宅和通用推荐", async () => {
  for (const question of ["钓鱼游戏和今天的新闻是什么？", "3D户型项目的家庭住址是什么？", "推荐几个游戏"] ) {
    const result = await answerKnowledgeQuestion({ question }, async () => { throw new Error("不得调用模型"); });
    assert.notEqual(result.retrievalTrace.decision, "answered");
    assert.deepEqual(result.sources, []);
  }
});
