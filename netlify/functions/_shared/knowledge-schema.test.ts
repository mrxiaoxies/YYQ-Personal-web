import assert from "node:assert/strict";
import test from "node:test";

import rawKnowledge from "../../../knowledge/index.json" with { type: "json" };
import { parseKnowledgeDocument } from "./knowledge-schema.ts";

test("知识结构会校验主题引用和公开工作月份", () => {
  const document = parseKnowledgeDocument(rawKnowledge);
  const publicIds = new Set(
    document.entries.filter((entry) => entry.visibility === "public").map((entry) => entry.id)
  );

  assert.equal(document.version, "1.3.0");
  assert.deepEqual(
    document.topics.map((topic) => topic.id),
    ["testing-skills", "tools-technology", "work-experience", "ai-workflow", "personal-projects"]
  );
  assert.equal(
    document.topics.every((topic) => topic.entryIds.every((id) => publicIds.has(id))),
    true
  );

  const overview = document.entries.find((entry) => entry.id === "work-overview");
  assert.deepEqual(overview?.employmentPeriods, [
    { company: "江南造船集团", role: "软件测试工程师", startMonth: "2018-01", endMonth: "2021-05" },
    { company: "上海分众传媒", role: "项目工程师", startMonth: "2021-10", endMonth: "2022-07" },
    { company: "上海蓝涧科技", role: "研发测试", startMonth: "2022-12", endMonth: "2024-01" },
    { company: "中电金信软件", role: "测试工程师", startMonth: "2024-05", endMonth: "present" }
  ]);
});

test("知识结构拒绝不存在的主题条目和非法月份", () => {
  const missingReference = structuredClone(rawKnowledge) as unknown as Record<string, unknown> & {
    topics: Array<Record<string, unknown>>;
  };
  missingReference.topics = [
    {
      category: "skill",
      description: "测试主题",
      entryIds: ["missing-entry"],
      id: "testing-skills",
      lexicalAnchors: ["测试"],
      title: "测试技能"
    }
  ];
  assert.throws(() => parseKnowledgeDocument(missingReference), /missing-entry/);

  const invalidMonth = structuredClone(rawKnowledge) as unknown as {
    entries: Array<Record<string, unknown>>;
    topics: Array<Record<string, unknown>>;
  };
  invalidMonth.topics = [];
  const overview = invalidMonth.entries.find((entry) => entry.id === "work-overview");
  if (!overview) throw new Error("测试资料缺少 work-overview");
  overview.employmentPeriods = [
    { company: "测试公司", role: "测试工程师", startMonth: "2018-13", endMonth: "present" }
  ];
  assert.throws(() => parseKnowledgeDocument(invalidMonth), /2018-13/);
});
