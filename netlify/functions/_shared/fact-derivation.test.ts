import assert from "node:assert/strict";
import test from "node:test";

import { publicEntries, publicTopics } from "./knowledge-data.ts";
import { deriveFacts } from "./fact-derivation.ts";
import type { KnowledgeEntry } from "./knowledge-schema.ts";

const workTopic = publicTopics.find((topic) => topic.id === "work-experience");
if (!workTopic) throw new Error("测试资料缺少工作经验主题");
const workEntries = publicEntries.filter((entry) => workTopic.entryIds.includes(entry.id));

test("从业跨度使用上海当前月份计算经过时间且不声称连续工作", () => {
  const facts = deriveFacts({
    entries: workEntries,
    now: new Date("2026-08-12T04:00:00.000Z"),
    question: "你的测试工作经验有多久？",
    topic: workTopic
  });
  const duration = facts.find((fact) => fact.id === "career-span");

  assert.deepEqual(duration?.value, { months: 7, totalMonths: 103, years: 8 });
  assert.match(duration?.statement ?? "", /从业跨度为 8 年 7 个月/);
  assert.doesNotMatch(duration?.statement ?? "", /连续工作/);
  assert.deepEqual(duration?.sourceEntryIds, ["work-overview"]);
});

test("事实推导会统计、分组、比较和概括已选公开证据", () => {
  const facts = deriveFacts({
    entries: workEntries,
    now: new Date("2026-08-12T04:00:00.000Z"),
    question: "概括测试工作经验",
    topic: workTopic
  });

  for (const type of ["count", "group", "compare", "summarize"] as const) {
    assert.ok(facts.some((fact) => fact.type === type), `缺少 ${type} 推导`);
  }
  assert.equal(
    facts.every((fact) => fact.sourceEntryIds.every((id) => workTopic.entryIds.includes(id))),
    true
  );
  assert.equal(facts.every((fact) => fact.ruleVersion === "1"), true);
});

test("事实关联只使用明确提到具体工具的公开证据", () => {
  const toolsTopic = publicTopics.find((topic) => topic.id === "tools-technology");
  if (!toolsTopic) throw new Error("测试资料缺少工具主题");
  const entries = publicEntries.filter((entry) => toolsTopic.entryIds.includes(entry.id));

  const postman = deriveFacts({ entries, question: "哪些经历用过 Postman？", topic: toolsTopic });
  const link = postman.find((fact) => fact.id === "entity-link:postman");
  assert.ok(link);
  assert.equal(
    link.sourceEntryIds.every((id) => entries.find((entry) => entry.id === id)?.content.includes("Postman")),
    true
  );

  const selenium = deriveFacts({ entries, question: "哪些经历用过 Selenium？", topic: toolsTopic });
  assert.equal(selenium.some((fact) => fact.type === "link"), false);
});

test("同月、跨年和无效工作日期不会出现加一或猜测", () => {
  const overview = workEntries.find((entry) => entry.id === "work-overview");
  if (!overview) throw new Error("测试资料缺少工作概览");
  const withStart = (startMonth: string): KnowledgeEntry => ({
    ...structuredClone(overview),
    employmentPeriods: [{ company: "测试公司", role: "测试工程师", startMonth, endMonth: "present" }]
  });

  const sameMonth = deriveFacts({
    entries: [withStart("2026-08")],
    now: new Date("2026-08-31T15:59:59.000Z"),
    question: "工作多久",
    topic: workTopic
  });
  assert.deepEqual(sameMonth.find((fact) => fact.id === "career-span")?.value, {
    months: 0,
    totalMonths: 0,
    years: 0
  });

  const acrossYear = deriveFacts({
    entries: [withStart("2025-12")],
    now: new Date("2026-01-01T00:00:00.000Z"),
    question: "工作多久",
    topic: workTopic
  });
  assert.deepEqual(acrossYear.find((fact) => fact.id === "career-span")?.value, {
    months: 1,
    totalMonths: 1,
    years: 0
  });

  for (const invalid of ["bad-date", "2099-01"]) {
    const facts = deriveFacts({
      entries: [withStart(invalid)],
      now: new Date("2026-08-12T04:00:00.000Z"),
      question: "工作多久",
      topic: workTopic
    });
    assert.equal(facts.some((fact) => fact.id === "career-span"), false);
  }
});

test("多个相互竞争的时间线会停止日期推导", () => {
  const overview = workEntries.find((entry) => entry.id === "work-overview");
  if (!overview) throw new Error("测试资料缺少工作概览");
  const conflicting = { ...structuredClone(overview), id: "another-overview" };
  const facts = deriveFacts({
    entries: [overview, conflicting],
    now: new Date("2026-08-12T04:00:00.000Z"),
    question: "工作多久",
    topic: { ...workTopic, entryIds: [...workTopic.entryIds, conflicting.id] }
  });
  assert.equal(facts.some((fact) => fact.type === "duration" || fact.type === "compare"), false);
});
