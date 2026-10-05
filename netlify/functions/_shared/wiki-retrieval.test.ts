import assert from "node:assert/strict";
import test from "node:test";
import { compileWiki } from "./wiki-schema.ts";
import { knowledgeDocument } from "./knowledge-data.ts";
import { planWikiEvidence, wikiSubqueries } from "./wiki-retrieval.ts";

const pages = compileWiki(knowledgeDocument).pages;
test("比较问法分别识别网站与微信项目，未知能力不转为泛化查询", () => {
  assert.equal(wikiSubqueries("个人网站与微信 AI 好友有什么共同点和差异？", pages).length, 2);
  assert.deepEqual(wikiSubqueries("个人网站与微信 AI 好友都用了 Selenium 吗？", pages), []);
  assert.deepEqual(wikiSubqueries("养老金项目用 Codex 吗？", pages), []);
  assert.deepEqual(wikiSubqueries("我什么时候开始学习 RAG？", pages), []);
});
test("技能与项目关系只展开具有明确技能来源的项目", () => {
  const queries = wikiSubqueries("哪些项目体现了你的 Linux 经验？", pages);
  assert.equal(queries.length, 2);
  assert.ok(queries.every(item => item.query.includes("Linux")));
  assert.deepEqual(wikiSubqueries("哪些项目体现了你的 Kubernetes 经验？", pages), []);
});
test("组织上下文不带入未接受来源，最多四页六千字", () => {
  const result = planWikiEvidence("个人网站与微信 AI 好友", pages, new Set(["project-personal-site", "project-wechat-ai"]));
  assert.equal(result.pages.length, 2);
  assert.ok(result.context.length <= 6000);
  assert.ok(result.pages.every(page => page.sourceEntryIds.every(id => ["project-personal-site", "project-wechat-ai"].includes(id))));
  assert.equal(planWikiEvidence("工具", pages, new Set()).pages.length, 0);
});
