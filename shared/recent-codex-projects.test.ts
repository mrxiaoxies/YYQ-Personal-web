import assert from "node:assert/strict";
import test from "node:test";
import { legacyDefaultSiteContent } from "./default-site-content.ts";
import { mergeRecentCodexProjects } from "./recent-codex-projects.ts";

test("recent project merge preserves edits and is idempotent", () => {
  const baseline = structuredClone(legacyDefaultSiteContent.sections.codex);
  const current = structuredClone(baseline);
  current.projects[0].summary = "管理员自己的简介";
  current.projects[0].operationSkills = ["已有操作"];
  assert.equal(current.projects.length, 3);
  const once = mergeRecentCodexProjects(current, baseline);
  assert.equal(once.projects.length, 11);
  assert.equal(once.projects[1].stage, "口播成片流程已验证");
  assert.equal(once.projects[0].summary, "管理员自己的简介");
  assert.ok(once.projects[0].operationSkills?.includes("已有操作"));
  assert.ok(once.projects[0].operationSkills?.includes("Git 版本管理与发布"));
  assert.equal(once.projects.filter(p => p.id === "codex-rag").length, 1);
  assert.deepEqual(mergeRecentCodexProjects(once, baseline), once);
  assert.equal(current.projects[0].operationSkills.length, 1);
});

test("项目进度板包含 Wiki 验证记录和新项目真实边界", () => {
  const baseline = legacyDefaultSiteContent.sections.codex;
  const board = mergeRecentCodexProjects(baseline, baseline);
  const rag = board.projects.find(project => project.id === "codex-rag")!;
  assert.match(rag.summary, /Wiki/);
  assert.ok(rag.timeline.some(item => item.id === "rag-wiki-20261005"));
  assert.match(board.projects.find(project => project.id === "codex-slow-jigging")!.next, /真人|试玩/);
  assert.match(board.projects.find(project => project.id === "codex-disk-audit")!.summary, /只读/);
  assert.match(board.projects.find(project => project.id === "codex-3d-floorplan")!.next, /吊顶/);
});
