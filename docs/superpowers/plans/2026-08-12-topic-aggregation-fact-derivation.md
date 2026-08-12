# Topic Aggregation and Fact Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace phrase-by-phrase broad-query handling with topic-level additive evidence aggregation, while adding a reusable “事实推导” layer that produces traceable calculations and summaries from public knowledge.

**Architecture:** `knowledge/index.json` remains the single source of truth and gains typed topic definitions plus structured employment periods. Existing child-document lexical/semantic RRF remains responsible for evidence ordering; a new topic layer combines fixed semantic, lexical, child-support, and evidence-coverage components using absolute thresholds. A server-only fact-derivation registry consumes the accepted topic and evidence, then supplies traceable results to the grounded answer layer; explicit unknown tools and cross-project claims continue to be rejected before aggregation.

**Tech Stack:** Node.js 24, TypeScript 5.9, Node test runner, Vite/React, Netlify Functions, `@huggingface/transformers` with local BGE small zh v1.5, OpenAI Responses API through Netlify AI Gateway.

## Global Constraints

- Public broad answers must start with `以下基于个人网站中的公开资料概括。`.
- Specific unknown skills, tools, frameworks, and platforms must remain refusals in lexical, hybrid, perfect-vector, and real-vector paths.
- Project-scoped questions may only aggregate evidence belonging to that project.
- Broad topic acceptance uses an absolute additive score; top1-top2 margin remains only for unresolved or single-weak-candidate retrieval.
- `knowledge/index.json` remains the only authored public fact source; `knowledge/vector-index.json` is generated.
- Fact derivation may calculate, count, group, link, compare, and summarize only facts traceable to public source entry IDs.
- The model may phrase fact-derivation output but may not change computed values or turn “从业跨度” into “连续工作年限”.
- Use `Asia/Shanghai` for current year/month and inject time in tests.
- Add comments only at non-obvious policy boundaries, explaining both what the code does and why.
- Do not add runtime dependencies.
- Target site version is `0.3.0`, knowledge version is `1.3.0`, and vector schema version is `2`.
- Do not deploy a Draft Preview or production site without a new explicit deployment authorization.
- Do not stage or modify `.codex/config.toml` or `outputs/`.
- The existing RAG implementation is currently uncommitted in the primary worktree. Before isolated execution, obtain approval for a scoped baseline commit or execute inline without rewriting unrelated user changes.

## File Structure

- Create `netlify/functions/_shared/knowledge-schema.ts`: runtime schema parser and shared TypeScript contracts.
- Create `netlify/functions/_shared/knowledge-data.ts`: load the fixed site knowledge JSON once and expose validated public entries/topics.
- Create `netlify/functions/_shared/knowledge-schema.test.ts`: schema, topic-reference, date, and privacy validation.
- Create `netlify/functions/_shared/topic-retrieval.ts`: topic lexical/semantic normalization, weighted scoring, and absolute acceptance.
- Create `netlify/functions/_shared/topic-retrieval.test.ts`: deterministic component and threshold tests.
- Create `netlify/functions/_shared/fact-derivation.ts`: fact rule registry and traceable results.
- Create `netlify/functions/_shared/fact-derivation.test.ts`: deterministic date/count/group/link/compare/summarize tests.
- Modify `knowledge/index.json`: add five topics and structured public employment periods.
- Modify `knowledge/vector-index.json`: regenerate schema v2 entry and topic vectors.
- Modify `netlify/functions/_shared/embedding.ts`: add topic embedding text builder.
- Modify `netlify/functions/_shared/retrieval.ts`: consume validated knowledge, expose scope checks, and invoke topic aggregation before the legacy single-entry acceptance gate.
- Modify `netlify/functions/_shared/hybrid-retrieval.ts`: validate and pass topic vectors, topic count, and vector schema v2.
- Modify `netlify/functions/_shared/ask-core.ts`: run fact derivation, build grounded evidence, add the public-summary prefix, and expose safe topic/fact trace fields.
- Modify `netlify/functions/ask.ts`: send fact derivations in the server-controlled evidence envelope.
- Modify `netlify/functions/health.ts`: publish topic/index readiness counts without internal paths or vectors.
- Modify relevant `*.test.ts` files: preserve all existing behavior and add integration regressions.
- Modify `scripts/generate-knowledge-vectors.mjs`: validate topics and emit schema v2 topic embeddings.
- Modify `scripts/evaluate-hybrid-retrieval.mjs`: generated broad-query matrix, real-vector negative corpus, and metric gates.
- Modify `scripts/verify-rag.mjs`: endpoint checks for public-summary prefix, fact derivation, and unknown-tool refusal.
- Modify `package.json` and `package-lock.json`: add new tests and bump `0.3.0` without dependency changes.
- Modify `VERSION`, `README.md`, `knowledge/README.md`, `docs/OPERATIONS.md`, and `CHANGELOG.md`: document behavior, commands, diagnostics, and release.

---

### Task 1: Typed Knowledge Schema and Public Topic Data

**Files:**
- Create: `netlify/functions/_shared/knowledge-schema.ts`
- Create: `netlify/functions/_shared/knowledge-data.ts`
- Create: `netlify/functions/_shared/knowledge-schema.test.ts`
- Modify: `knowledge/index.json`
- Modify: `netlify/functions/_shared/retrieval.ts:1-14`
- Modify: `package.json:17`

**Interfaces:**
- Produces: `KnowledgeEntry`, `EmploymentPeriod`, `KnowledgeTopic`, `KnowledgeDocument`, `parseKnowledgeDocument(value)`, `knowledgeDocument`, `publicEntries`, and `publicTopics`.
- Consumes: existing `knowledge/index.json` fields and Node JSON imports.

- [ ] **Step 1: Register a failing schema test**

Add the test file to `test:rag`, then create `knowledge-schema.test.ts` with these assertions:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import rawKnowledge from "../../../knowledge/index.json" with { type: "json" };
import { parseKnowledgeDocument } from "./knowledge-schema.ts";

test("knowledge schema validates topic references and public employment periods", () => {
  const document = parseKnowledgeDocument(rawKnowledge);
  const publicIds = new Set(document.entries.filter((entry) => entry.visibility === "public").map((entry) => entry.id));

  assert.equal(document.version, "1.3.0");
  assert.deepEqual(document.topics.map((topic) => topic.id), [
    "testing-skills",
    "tools-technology",
    "work-experience",
    "ai-workflow",
    "personal-projects"
  ]);
  assert.equal(document.topics.every((topic) => topic.entryIds.every((id) => publicIds.has(id))), true);

  const overview = document.entries.find((entry) => entry.id === "work-overview");
  assert.deepEqual(overview?.employmentPeriods, [
    { company: "江南造船集团", role: "软件测试工程师", startMonth: "2018-01", endMonth: "2021-05" },
    { company: "上海分众传媒", role: "项目工程师", startMonth: "2021-10", endMonth: "2022-07" },
    { company: "上海蓝涧科技", role: "研发测试", startMonth: "2022-12", endMonth: "2024-01" },
    { company: "中电金信软件", role: "测试工程师", startMonth: "2024-05", endMonth: "present" }
  ]);
});

test("knowledge schema rejects invalid topic entry IDs and invalid months", () => {
  assert.throws(
    () => parseKnowledgeDocument({ ...rawKnowledge, topics: [{ ...rawKnowledge.topics[0], entryIds: ["missing-entry"] }] }),
    /missing-entry/
  );
  const entries = structuredClone(rawKnowledge.entries);
  const overview = entries.find((entry) => entry.id === "work-overview");
  if (!overview) throw new Error("work-overview fixture missing");
  overview.employmentPeriods = [{ company: "测试", role: "测试", startMonth: "2018-13", endMonth: "present" }];
  assert.throws(() => parseKnowledgeDocument({ ...rawKnowledge, entries }), /2018-13/);
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run:

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/knowledge-schema.test.ts
```

Purpose: execute only the new schema contract. Expected: FAIL because `knowledge-schema.ts` and `topics` do not exist.

- [ ] **Step 3: Implement the shared schema contract**

Create these exported contracts and parser in `knowledge-schema.ts`:

```ts
export type EmploymentPeriod = {
  company: string;
  endMonth: string | "present";
  role: string;
  startMonth: string;
};

export type KnowledgeEntry = {
  aliases: string[];
  category: string;
  company: string;
  content: string;
  employmentPeriods?: EmploymentPeriod[];
  id: string;
  period: string;
  role: string;
  tags: string[];
  title: string;
  visibility: "public" | "private";
};

export type KnowledgeTopic = {
  category: "skill" | "tool" | "work" | "ai" | "project";
  description: string;
  entryIds: string[];
  id: string;
  lexicalAnchors: string[];
  overviewEntryId?: string;
  title: string;
};

export type KnowledgeDocument = {
  entries: KnowledgeEntry[];
  topics: KnowledgeTopic[];
  updatedAt: string;
  version: string;
};
```

Use a strict `YYYY-MM` validator and throw field-specific errors:

```ts
const YEAR_MONTH = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/;

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${field} 必须是非空字符串数组`);
  }
  return value;
}

function stringsOfPeriods(value: unknown, entryId: string): EmploymentPeriod[] {
  if (!Array.isArray(value)) throw new Error(`${entryId}.employmentPeriods 必须是数组`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${entryId}.employmentPeriods[${index}] 无效`);
    }
    const period = item as Record<string, unknown>;
    const company = typeof period.company === "string" ? period.company.trim() : "";
    const role = typeof period.role === "string" ? period.role.trim() : "";
    const startMonth = typeof period.startMonth === "string" ? period.startMonth : "";
    const endMonth = typeof period.endMonth === "string" ? period.endMonth : "";
    if (!company || !role) throw new Error(`${entryId}.employmentPeriods[${index}] 缺少公司或岗位`);
    if (!YEAR_MONTH.test(startMonth)) throw new Error(`${entryId}.employmentPeriods[${index}] 起始月份 ${startMonth} 无效`);
    if (endMonth !== "present" && !YEAR_MONTH.test(endMonth)) {
      throw new Error(`${entryId}.employmentPeriods[${index}] 结束月份 ${endMonth} 无效`);
    }
    return { company, endMonth, role, startMonth };
  });
}

const TOPIC_CATEGORIES = new Set(["skill", "tool", "work", "ai", "project"]);

function parseTopics(value: unknown[], publicIds: ReadonlySet<string>): KnowledgeTopic[] {
  const topics = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`主题 ${index + 1} 无效`);
    const topic = item as Record<string, unknown>;
    for (const field of ["id", "title", "description", "category"]) {
      if (typeof topic[field] !== "string" || !String(topic[field]).trim()) throw new Error(`主题 ${index + 1} 的 ${field} 无效`);
    }
    if (!TOPIC_CATEGORIES.has(String(topic.category))) throw new Error(`主题 ${topic.id} 的 category 无效`);
    const entryIds = strings(topic.entryIds, `${topic.id}.entryIds`);
    const missingId = entryIds.find((id) => !publicIds.has(id));
    if (missingId) throw new Error(`主题 ${topic.id} 引用了非公开或不存在的条目 ${missingId}`);
    const overviewEntryId = typeof topic.overviewEntryId === "string" ? topic.overviewEntryId : undefined;
    if (overviewEntryId && !entryIds.includes(overviewEntryId)) {
      throw new Error(`主题 ${topic.id} 的 overviewEntryId 不在 entryIds 中`);
    }
    return {
      category: topic.category as KnowledgeTopic["category"],
      description: String(topic.description), entryIds, id: String(topic.id),
      lexicalAnchors: strings(topic.lexicalAnchors, `${topic.id}.lexicalAnchors`),
      ...(overviewEntryId ? { overviewEntryId } : {}), title: String(topic.title)
    };
  });
  if (new Set(topics.map((topic) => topic.id)).size !== topics.length) throw new Error("主题 ID 重复");
  return topics;
}

export function parseKnowledgeDocument(value: unknown): KnowledgeDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("知识库必须是对象");
  const source = value as Record<string, unknown>;
  if (typeof source.version !== "string" || !source.version) throw new Error("知识库 version 无效");
  if (typeof source.updatedAt !== "string") throw new Error("知识库 updatedAt 无效");
  if (!Array.isArray(source.entries) || !Array.isArray(source.topics)) throw new Error("知识库缺少 entries 或 topics");

  const entries = source.entries.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`知识条目 ${index + 1} 无效`);
    const entry = item as Record<string, unknown>;
    for (const field of ["id", "title", "category", "company", "content", "period", "role", "visibility"]) {
      if (typeof entry[field] !== "string") throw new Error(`知识条目 ${index + 1} 的 ${field} 无效`);
    }
    const employmentPeriods = entry.employmentPeriods === undefined ? undefined : stringsOfPeriods(entry.employmentPeriods, String(entry.id));
    return {
      aliases: strings(entry.aliases, `${entry.id}.aliases`),
      category: String(entry.category), company: String(entry.company), content: String(entry.content),
      ...(employmentPeriods ? { employmentPeriods } : {}),
      id: String(entry.id), period: String(entry.period), role: String(entry.role),
      tags: strings(entry.tags, `${entry.id}.tags`), title: String(entry.title),
      visibility: entry.visibility === "private" ? "private" : "public"
    } satisfies KnowledgeEntry;
  });

  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error("知识条目 ID 重复");
  const publicIds = new Set(entries.filter((entry) => entry.visibility === "public").map((entry) => entry.id));
  const topics = parseTopics(source.topics, publicIds);
  return { entries, topics, updatedAt: source.updatedAt, version: source.version };
}
```

These validators serve index integrity; the implementation comment above the public-ID check must explain that topic aggregation may only reference public entries so a broad summary can never pull private evidence into the model context.

- [ ] **Step 4: Add the five topic definitions and employment periods**

Set `knowledge/index.json.version` to `1.3.0`, set `updatedAt` to `2026-08-12`, and add this top-level `topics` array before `entries`:

```json
[
  {
    "id": "testing-skills",
    "title": "测试技能公开概括",
    "description": "公开资料中的软件测试方法、接口与数据验证、环境排查、软硬件结合测试和业务流程测试能力。",
    "category": "skill",
    "entryIds": ["skill-testing-methods", "skill-api-data-environment", "work-cec-bank-platform", "work-cec-data-disclosure", "work-cec-pension", "work-lanjian-edge-ai", "work-focusmedia-player", "work-jiangnan-eagle-eye", "work-jiangnan-hardware"],
    "lexicalAnchors": ["测试", "测试技能", "测试能力", "软件测试", "测试经验"]
  },
  {
    "id": "tools-technology",
    "title": "工具与技术公开概括",
    "description": "公开工作和个人项目中明确使用过的测试工具、开发工具、环境工具、技术栈和平台。",
    "category": "tool",
    "overviewEntryId": "skill-tools-overview",
    "entryIds": ["skill-tools-overview", "skill-api-data-environment", "skill-ai-workflow", "project-personal-site", "work-cec-bank-platform", "work-lanjian-edge-ai", "work-focusmedia-player", "work-jiangnan-hardware"],
    "lexicalAnchors": ["工具", "测试工具", "技术", "技术栈", "开发工具"]
  },
  {
    "id": "work-experience",
    "title": "工作经验公开概括",
    "description": "从 2018 年开始公开的测试工作时间线、公司岗位、行业场景、项目经历和跨阶段能力。",
    "category": "work",
    "overviewEntryId": "work-overview",
    "entryIds": ["work-overview", "work-cec-bank-platform", "work-cec-data-disclosure", "work-cec-pension", "work-lanjian-edge-ai", "work-focusmedia-player", "work-jiangnan-eagle-eye", "work-jiangnan-hardware"],
    "lexicalAnchors": ["工作", "工作经验", "测试工作经验", "从业经历", "职业经历", "公司经历"]
  },
  {
    "id": "ai-workflow",
    "title": "AI 工作流公开概括",
    "description": "公开资料中的 Codex 协作开发、提示词拆解、AI 工作流梳理及相关个人项目实践。",
    "category": "ai",
    "entryIds": ["skill-ai-workflow", "project-personal-site", "project-auto-editing", "project-wechat-ai"],
    "lexicalAnchors": ["AI", "AI 工作流", "Codex", "人工智能工具"]
  },
  {
    "id": "personal-projects",
    "title": "个人项目公开概括",
    "description": "个人网站、自动剪辑工作流和微信 AI 好友工作流的公开目标、技术、进度与风险控制。",
    "category": "project",
    "entryIds": ["project-personal-site", "project-auto-editing", "project-wechat-ai"],
    "lexicalAnchors": ["个人项目", "业余项目", "作品", "项目经历"]
  }
]
```

Add the four exact `employmentPeriods` objects from Step 1 to `work-overview`. Do not add dates to project entries whose `period` is only a project milestone.

- [ ] **Step 5: Load validated data at runtime and remove the duplicate entry type**

Create `knowledge-data.ts`:

```ts
import rawKnowledge from "../../../knowledge/index.json" with { type: "json" };
import { parseKnowledgeDocument } from "./knowledge-schema.ts";

export const knowledgeDocument = parseKnowledgeDocument(rawKnowledge);
export const publicEntries = knowledgeDocument.entries.filter((entry) => entry.visibility === "public");
export const publicTopics = knowledgeDocument.topics;
```

Change `retrieval.ts` to import `knowledgeDocument` and `publicEntries`, re-export `KnowledgeEntry` from `knowledge-schema.ts`, and use `knowledgeDocument.version/updatedAt`. Remove its local `KnowledgeEntry` declaration and local JSON filtering.

- [ ] **Step 6: Run schema and retrieval regression tests**

Run:

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/knowledge-schema.test.ts netlify/functions/_shared/retrieval.test.ts
```

Purpose: prove the new single runtime schema is valid without changing retrieval behavior. Expected: all tests PASS.

- [ ] **Step 7: Commit the schema migration**

```powershell
git add knowledge/index.json package.json netlify/functions/_shared/knowledge-schema.ts netlify/functions/_shared/knowledge-data.ts netlify/functions/_shared/knowledge-schema.test.ts netlify/functions/_shared/retrieval.ts
git commit -m "feat: add typed rag topic knowledge"
```

### Task 2: Vector Index Schema v2 with Topic Embeddings

**Files:**
- Modify: `netlify/functions/_shared/embedding.ts`
- Modify: `scripts/generate-knowledge-vectors.mjs`
- Modify: `knowledge/vector-index.json`
- Modify: `netlify/functions/_shared/hybrid-retrieval.test.ts`

**Interfaces:**
- Consumes: `KnowledgeTopic`, `parseKnowledgeDocument`, local BGE embedding functions.
- Produces: `buildTopicEmbeddingText(topic)`, vector schema v2 `{ entries, topics, entryCount, topicCount }`.

- [ ] **Step 1: Add failing vector-schema tests**

Extend `hybrid-retrieval.test.ts` so a valid fixture requires `schemaVersion: 2`, `topicCount: 5`, and topic vectors. Add invalid cases for missing topic ID, mismatched topic count, and a topic vector with 511 dimensions:

```ts
test("static hybrid metadata validates entry and topic vectors", () => {
  const metadata = getHybridRetrievalMetadata();
  assert.equal(metadata.indexReady, true);
  assert.equal(metadata.indexEntryCount, 16);
  assert.equal(metadata.indexTopicCount, 5);
});
```

Expected new fallback reasons: `index-topic-count-mismatch`, `index-topic-id-mismatch`, and `index-topic-vector-invalid`.

- [ ] **Step 2: Run the hybrid test and verify it fails**

Run:

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/hybrid-retrieval.test.ts
```

Purpose: verify schema v1 cannot satisfy the new topic-vector contract. Expected: FAIL on schema and metadata assertions.

- [ ] **Step 3: Add deterministic topic embedding text**

Add to `embedding.ts`:

```ts
import type { KnowledgeTopic } from "./knowledge-schema.ts";

export function buildTopicEmbeddingText(topic: KnowledgeTopic) {
  return [
    `主题：${topic.title}`,
    `主题说明：${topic.description}`,
    `稳定主题词：${topic.lexicalAnchors.join("、")}`
  ].join("\n");
}
```

The comment above this function must state that topic descriptions are embedded separately so broad questions compete by subject, not by a single resume chunk.

- [ ] **Step 4: Generate and validate vector schema v2**

In `generate-knowledge-vectors.mjs`, import `parseKnowledgeDocument` and `buildTopicEmbeddingText`, set `VECTOR_INDEX_SCHEMA_VERSION = 2`, validate the selected knowledge file with the shared parser, and embed entries and topics in one batch:

```js
const entryTexts = knowledge.entries.map(buildKnowledgeEmbeddingText);
const topicTexts = knowledge.topics.map(buildTopicEmbeddingText);
const embeddings = await embedKnowledgeDocuments([...entryTexts, ...topicTexts]);
const entryEmbeddings = embeddings.slice(0, knowledge.entries.length);
const topicEmbeddings = embeddings.slice(knowledge.entries.length);
```

Write this exact shape:

```js
{
  schemaVersion: 2,
  documentTextFormatVersion: 1,
  model: LOCAL_EMBEDDING_MODEL,
  modelId: LOCAL_EMBEDDING_MODEL_ID,
  dimension: LOCAL_EMBEDDING_DIMENSIONS,
  knowledgeVersion: knowledge.version,
  knowledgeUpdatedAt: knowledge.updatedAt,
  entryCount: knowledge.entries.length,
  topicCount: knowledge.topics.length,
  entries: knowledge.entries.map((entry, index) => ({ id: entry.id, embedding: Array.from(entryEmbeddings[index]) })),
  topics: knowledge.topics.map((topic, index) => ({ id: topic.id, embedding: Array.from(topicEmbeddings[index]) }))
}
```

- [ ] **Step 5: Rebuild the real local index**

Run:

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
$env:Path="$nodeDir;$env:Path"
& "$nodeDir\npm.cmd" run vectors:build
```

Purpose: convert every public entry and five topic descriptions to 512-dimensional local vectors and write the generated index atomically. Expected output: knowledge `1.3.0`, 16 entries, 5 topics, and no network download.

- [ ] **Step 6: Commit the generated index contract**

```powershell
git add knowledge/vector-index.json netlify/functions/_shared/embedding.ts netlify/functions/_shared/hybrid-retrieval.test.ts scripts/generate-knowledge-vectors.mjs
git commit -m "feat: index rag topics with local embeddings"
```

### Task 3: Reusable Fact Derivation Registry

**Files:**
- Create: `netlify/functions/_shared/fact-derivation.ts`
- Create: `netlify/functions/_shared/fact-derivation.test.ts`
- Modify: `package.json:17`

**Interfaces:**
- Consumes: accepted `KnowledgeTopic`, `KnowledgeEntry[]`, question text, injected `Date`, and `Asia/Shanghai`.
- Produces: `FactDerivation`, `FactDerivationContext`, `deriveFacts(context)`.

- [ ] **Step 1: Write failing deterministic fact tests**

Create tests that fix the clock and exercise every allowed type:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { publicEntries, publicTopics } from "./knowledge-data.ts";
import { deriveFacts } from "./fact-derivation.ts";

const workTopic = publicTopics.find((topic) => topic.id === "work-experience");
if (!workTopic) throw new Error("work topic missing");
const workEntries = publicEntries.filter((entry) => workTopic.entryIds.includes(entry.id));

test("career duration is elapsed Shanghai months and never continuous employment", () => {
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

test("fact registry groups and links only selected public evidence", () => {
  const facts = deriveFacts({ entries: workEntries, now: new Date("2026-08-12T04:00:00.000Z"), question: "概括测试工作经验", topic: workTopic });
  assert.ok(facts.some((fact) => fact.type === "count"));
  assert.ok(facts.some((fact) => fact.type === "group"));
  assert.ok(facts.some((fact) => fact.type === "compare"));
  assert.ok(facts.some((fact) => fact.type === "summarize"));
  assert.equal(facts.every((fact) => fact.sourceEntryIds.every((id) => workTopic.entryIds.includes(id))), true);
});
```

Also test `2018-01` to `2018-01` equals 0 months, December-to-January equals 1 month, invalid/future/missing dates omit `career-span`, a specific `Postman` query creates a `link` only from entries explicitly containing `Postman`, and `Selenium` creates no link.

- [ ] **Step 2: Run the fact test and verify it fails**

Run:

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/fact-derivation.test.ts
```

Purpose: isolate deterministic reasoning before it reaches retrieval or the model. Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the fact result contract and rule registry**

Use these public types:

```ts
export type FactDerivationType = "duration" | "count" | "group" | "link" | "compare" | "summarize";

export type FactDerivation = {
  id: string;
  ruleVersion: "1";
  sourceEntryIds: string[];
  statement: string;
  topicId: string;
  type: FactDerivationType;
  value: unknown;
};

export type FactDerivationContext = {
  entries: KnowledgeEntry[];
  now?: Date;
  question: string;
  timeZone?: "Asia/Shanghai";
  topic: KnowledgeTopic;
};
```

Implement a fixed registry:

```ts
type ResolvedFactContext = Omit<FactDerivationContext, "now" | "timeZone"> & {
  now: Date;
  timeZone: "Asia/Shanghai";
};
type FactRule = (context: ResolvedFactContext) => FactDerivation[];

function fact(context: ResolvedFactContext, value: Omit<FactDerivation, "ruleVersion" | "topicId">): FactDerivation {
  return { ...value, ruleVersion: "1", topicId: context.topic.id };
}

function deriveCareerSpan(context: ResolvedFactContext): FactDerivation[] {
  if (context.topic.id !== "work-experience" && !/(?:工作|从业|职业|测试经验|几年|多久)/.test(context.question)) return [];
  const timelineSources = context.entries.filter((entry) => entry.employmentPeriods?.length);
  // Multiple authored timelines would make the calculation ambiguous, so facts are omitted instead of choosing one silently.
  if (timelineSources.length !== 1) return [];
  const source = timelineSources[0];
  const starts = source?.employmentPeriods?.map((period) => period.startMonth).filter((month) => /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)).sort();
  const start = starts?.[0];
  if (!source || !start || Number.isNaN(context.now.getTime())) return [];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: context.timeZone, year: "numeric", month: "2-digit" }).formatToParts(context.now);
  const currentYear = Number(parts.find((part) => part.type === "year")?.value);
  const currentMonth = Number(parts.find((part) => part.type === "month")?.value);
  const [startYear, startMonth] = start.split("-").map(Number);
  const totalMonths = (currentYear - startYear) * 12 + currentMonth - startMonth;
  if (!Number.isInteger(totalMonths) || totalMonths < 0) return [];
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const label = [years ? `${years} 年` : "", months ? `${months} 个月` : ""].filter(Boolean).join(" ") || "不足 1 个月";
  return [fact(context, {
    id: "career-span", sourceEntryIds: [source.id],
    statement: `按最早公开工作月份 ${start} 计算，截至当前上海月份，公开经历的从业跨度为 ${label}。`,
    type: "duration", value: { months, totalMonths, years }
  })];
}

function deriveEvidenceCount(context: ResolvedFactContext): FactDerivation[] {
  const sourceEntryIds = [...new Set(context.entries.map((entry) => entry.id))];
  if (sourceEntryIds.length < 2) return [];
  return [fact(context, { id: "evidence-count", sourceEntryIds, statement: `本次概括基于 ${sourceEntryIds.length} 条公开资料。`, type: "count", value: sourceEntryIds.length })];
}

function deriveCategoryGroups(context: ResolvedFactContext): FactDerivation[] {
  const groups = Object.fromEntries([...new Set(context.entries.map((entry) => entry.category))].sort().map((category) => [category, context.entries.filter((entry) => entry.category === category).map((entry) => entry.id)]));
  const sourceEntryIds = [...new Set(Object.values(groups).flat())];
  if (sourceEntryIds.length < 2) return [];
  return [fact(context, { id: "evidence-groups", sourceEntryIds, statement: "公开证据已按知识类别分组，供回答进行跨条目归纳。", type: "group", value: groups })];
}

const KNOWN_CHINESE_ENTITY_TERMS = ["前端控制台"] as const;
function queryEntities(question: string) {
  return [...new Set([...(question.match(/[A-Za-z][A-Za-z0-9.+#-]{1,}/g) ?? []), ...KNOWN_CHINESE_ENTITY_TERMS.filter((term) => question.includes(term))])];
}

function deriveExplicitEntityLinks(context: ResolvedFactContext): FactDerivation[] {
  return queryEntities(context.question).flatMap((entity) => {
    const normalized = entity.toLowerCase();
    const sources = context.entries.filter((entry) => [entry.title, entry.content, ...entry.tags, ...entry.aliases].join("\n").toLowerCase().includes(normalized));
    if (sources.length === 0) return [];
    return [fact(context, { id: `entity-link:${normalized}`, sourceEntryIds: sources.map((entry) => entry.id), statement: `公开资料在 ${sources.length} 条证据中明确提到 ${entity}。`, type: "link", value: { entity, sourceEntryIds: sources.map((entry) => entry.id) } })];
  });
}

function deriveEmploymentTimeline(context: ResolvedFactContext): FactDerivation[] {
  const timelineSources = context.entries.filter((entry) => entry.employmentPeriods?.length);
  if (timelineSources.length !== 1) return [];
  const source = timelineSources[0];
  if (!source?.employmentPeriods) return [];
  return [fact(context, { id: "employment-timeline", sourceEntryIds: [source.id], statement: "公开工作经历可以按结构化起止月份和岗位顺序进行阶段比较。", type: "compare", value: source.employmentPeriods })];
}

function deriveTopicEvidenceSummary(context: ResolvedFactContext): FactDerivation[] {
  if (context.entries.length < 2) return [];
  const sourceEntryIds = context.entries.map((entry) => entry.id);
  return [fact(context, {
    id: "topic-evidence-summary", sourceEntryIds,
    statement: `以下结构化资料用于概括“${context.topic.title}”，它本身不新增简历事实。`,
    type: "summarize",
    value: context.entries.map(({ company, id, period, role, title }) => ({ company, period, role, sourceEntryId: id, title }))
  })];
}

const RULES: readonly FactRule[] = [
  deriveCareerSpan,
  deriveEvidenceCount,
  deriveCategoryGroups,
  deriveExplicitEntityLinks,
  deriveEmploymentTimeline,
  deriveTopicEvidenceSummary
];

export function deriveFacts(context: FactDerivationContext): FactDerivation[] {
  const safeEntries = context.entries.filter(
    (entry) => entry.visibility === "public" && context.topic.entryIds.includes(entry.id)
  );
  const normalized: ResolvedFactContext = {
    ...context,
    entries: safeEntries,
    now: context.now ?? new Date(),
    timeZone: "Asia/Shanghai"
  };
  return RULES.flatMap((rule) => rule(normalized)).filter(
    (fact) => fact.sourceEntryIds.length > 0 && fact.sourceEntryIds.every((id) => safeEntries.some((entry) => entry.id === id))
  );
}
```

Add a comment at `totalMonths` explaining why no `+1` is used: January 2018 to August 2026 is 103 elapsed months, or 8 years 7 months; inclusive counting would incorrectly add a full month.

The registry deliberately links only explicit entity strings; it does not translate synonyms into new capabilities. Chinese unknown-tool protection remains in the retrieval claim gate from Task 5.

- [ ] **Step 4: Run fact derivation tests**

Run the same command as Step 2. Expected: all fact tests PASS.

- [ ] **Step 5: Commit the independent fact engine**

```powershell
git add package.json netlify/functions/_shared/fact-derivation.ts netlify/functions/_shared/fact-derivation.test.ts
git commit -m "feat: add traceable rag fact derivation"
```

### Task 4: Topic-Level Additive Scoring

**Files:**
- Create: `netlify/functions/_shared/topic-retrieval.ts`
- Create: `netlify/functions/_shared/topic-retrieval.test.ts`
- Modify: `package.json:17`

**Interfaces:**
- Consumes: query, `KnowledgeTopic[]`, normalized child evidence signals, optional topic embeddings.
- Produces: `TopicEvidenceSignal`, `TopicSemanticInput`, `TopicMatch`, `rankKnowledgeTopics(input)`.

- [ ] **Step 1: Write failing scoring tests**

Use small deterministic vectors so the formula can be asserted exactly:

```ts
const testingTopic: KnowledgeTopic = {
  category: "skill",
  description: "公开的软件测试方法、接口数据验证和环境排查能力。",
  entryIds: ["skill-testing-methods", "skill-api-data-environment"],
  id: "testing-skills",
  lexicalAnchors: ["测试", "测试技能", "测试能力"],
  title: "测试技能公开概括"
};

test("broad topic score adds semantic lexical child and coverage components", () => {
  const [match] = rankKnowledgeTopics({
    evidence: [
      { entryId: "skill-testing-methods", lexical: 0.8, semantic: 0.7, valid: true },
      { entryId: "skill-api-data-environment", lexical: 0.6, semantic: 0.6, valid: true }
    ],
    query: "介绍一下你的测试能力",
    semantic: {
      dimensions: 2,
      knowledgeVersion: "1.3.0",
      model: "bge-small-zh-v1.5",
      queryEmbedding: [1, 0],
      topicEmbeddings: { "testing-skills": [1, 0] }
    },
    topics: [testingTopic]
  });
  assert.equal(match.topic.id, "testing-skills");
  assert.equal(match.accepted, true);
  assert.equal(match.evidenceCount, 2);
  assert.deepEqual(match.components, { semantic: 1, lexical: 1, childSupport: 0.7, evidenceCoverage: 0.666667 });
  assert.equal(match.score, 0.921667);
});
```

Add tests proving: a broad topic can pass with two evidence entries even when another topic has a close score; one weak evidence entry fails; a lexical-only fallback can pass at its own fixed threshold; a query with no stable topic words fails; and all component values remain in `[0,1]`.

- [ ] **Step 2: Run the scoring test and verify it fails**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/topic-retrieval.test.ts
```

Purpose: validate the additive policy independently from the legacy retrieval gate. Expected: FAIL because the scorer does not exist.

- [ ] **Step 3: Implement fixed normalization and scoring**

Use these constants and contracts:

```ts
export const TOPIC_SCORE_WEIGHTS = { semantic: 0.45, lexical: 0.30, childSupport: 0.15, evidenceCoverage: 0.10 } as const;
export const MIN_HYBRID_TOPIC_SCORE = 0.46;
export const MIN_LEXICAL_TOPIC_SCORE = 0.38;

export type TopicEvidenceSignal = { entryId: string; lexical: number; semantic?: number; valid: boolean };
export type TopicSemanticInput = {
  dimensions: number;
  knowledgeVersion: string;
  model: string;
  queryEmbedding: EmbeddingVector;
  topicEmbeddings: Readonly<Record<string, EmbeddingVector>>;
};
export type TopicMatch = {
  accepted: boolean;
  components: { semantic: number; lexical: number; childSupport: number; evidenceCoverage: number };
  evidenceCount: number;
  score: number;
  topic: KnowledgeTopic;
};
```

Normalize semantic similarity with `clamp((cosine - 0.35) / 0.35)`. Compute lexical relevance after removing personal/action fillers, using exact anchor containment first and character bigram overlap second. Compute child support as the mean of the two strongest valid `max(lexical, semantic)` signals. Compute evidence coverage as `min(validIndependentEntries / 3, 1)`.

The exact score is:

```ts
const score =
  components.semantic * 0.45 +
  components.lexical * 0.30 +
  components.childSupport * 0.15 +
  components.evidenceCoverage * 0.10;
```

Accept only if score reaches the hybrid/lexical threshold and there are at least two valid evidence entries, or the topic has a designated complete overview entry in its `entryIds` with a valid signal. Do not calculate or check a topic margin. Add a comment explaining that absolute evidence strength prevents a second relevant topic from causing a broad-query false refusal.

- [ ] **Step 4: Run topic-scoring tests**

Run the Step 2 command. Expected: all tests PASS with exact component values.

- [ ] **Step 5: Commit the topic scorer**

```powershell
git add package.json netlify/functions/_shared/topic-retrieval.ts netlify/functions/_shared/topic-retrieval.test.ts
git commit -m "feat: score rag topics with additive evidence"
```

### Task 5: Integrate Topic Aggregation with Strict Claim and Project Gates

**Files:**
- Modify: `netlify/functions/_shared/retrieval.ts`
- Modify: `netlify/functions/_shared/retrieval.test.ts`

**Interfaces:**
- Consumes: `rankKnowledgeTopics`, public topics, existing lexical/semantic rankings and claim support checks.
- Produces: `RetrievalResult.topic?: RetrievalTopicResult` and topic-selected evidence hits.

- [ ] **Step 1: Add failing broad-query matrix and safety regressions**

Generate a deterministic positive matrix from these dimensions: personal prefix `['', '你', '您', '杨烨齐']`, action `['有哪些', '会什么', '介绍一下', '说说', '概括']`, and topic phrase groups for testing/tools/work/AI/projects. Assert at least 95% of valid combinations are accepted with the expected topic ID.

Add explicit safety cases with both normal semantic input and perfect semantic fixtures:

```ts
const strictRefusals = [
  "你会 Selenium 吗？",
  "你会 Kubernetes 吗？",
  "你平时用禅道吗？",
  "你会用 Postman 和禅道吗？",
  "你用过哪些自动化测试框架？",
  "你会哪些 CI 工具？",
  "养老金项目用了 Codex 吗？",
  "银行客服平台是用 React 开发的吗？"
];
```

Also assert `养老金项目有哪些工具？` returns only `work-cec-pension` evidence, and `银行客服平台技术栈是什么？` returns only bank-platform evidence. Preserve the existing process questions such as “接口返回怪怪的，你平时会去哪几处找原因？” as accepted regressions.

- [ ] **Step 2: Run retrieval tests and verify the new matrix fails**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/retrieval.test.ts
```

Purpose: prove the exact-question overview router cannot satisfy generalized topic behavior. Expected: new broad variants FAIL while old tests remain diagnostic.

- [ ] **Step 3: Extend the retrieval result and semantic input**

Add:

```ts
export type RetrievalTopicResult = {
  evidenceCount: number;
  id: string;
  mode: "overview" | "scoped";
  score: number;
  title: string;
};

export type RetrievalResult = {
  accepted: boolean;
  coverage: number;
  hits: RetrievalHit[];
  query: string;
  reason: "accepted" | "ambiguous" | "insufficient-evidence" | "no-meaningful-query";
  topic?: RetrievalTopicResult;
};
```

Add `topicEmbeddings` to `SemanticRetrievalInput`. Keep existing callers compatible by treating it as optional until Task 6 passes schema-v2 data.

- [ ] **Step 4: Run strict scope checks before topic scoring**

Refactor existing claim/project helpers without weakening them:

```ts
function requestedProjectEntryIds(query: string) {
  const compactQuery = compactText(query);
  const requested = new Set<string>();
  for (const [anchor, entryIds] of projectAnchorDocuments) {
    if (!compactQuery.includes(compactText(anchor))) continue;
    for (const entryId of entryIds) requested.add(entryId);
  }
  return requested;
}

const requestedClaim = extractRequestedClaim(normalizedQuery);
const projectScopeEntryIds = requestedProjectEntryIds(normalizedQuery);
const hasSpecificClaim = Boolean(requestedClaim && !isBroadGenericClaim(requestedClaim));
const topicAggregationAllowed = projectScopeEntryIds.size === 0 && !hasSpecificClaim;
```

Before aggregation, reject a specific claim unless at least one candidate entry explicitly supports the full requested claim. For project questions, restrict every lexical, semantic, and returned candidate to `projectScopeEntryIds`; never use a general topic overview to satisfy a project-specific question. The code comment must state that additive topic confidence cannot override unsupported entities or project ownership.

- [ ] **Step 5: Build evidence signals and accept broad topics before the legacy margin gate**

After child lexical and semantic rankings are available, create one signal per public entry:

```ts
function normalizeChildLexicalScore(score: number | undefined, topScore: number | undefined) {
  if (!Number.isFinite(score) || !Number.isFinite(topScore) || (topScore ?? 0) <= 0) return 0;
  return Math.max(0, Math.min(1, (score ?? 0) / (topScore ?? 1)));
}

const evidenceSignals = publicEntries.map((entry) => ({
  entryId: entry.id,
  lexical: normalizeChildLexicalScore(ranked.find((hit) => hit.entry.id === entry.id)?.score, top?.score),
  semantic: semanticRanking?.find((hit) => hit.entry.id === entry.id)?.similarity,
  valid: entrySupportsRequestedClaim(normalizedQuery, entry)
}));
```

Call `rankKnowledgeTopics`. When the first match is accepted, collect up to six hits whose IDs belong to that topic and are valid, using existing RRF order. Return `topic: { id, title, score, evidenceCount, mode: "overview" }`. If no broad topic passes, continue through the existing single-entry lexical/vector gates and keep their margin behavior. For an accepted specific-claim or project-scoped result, attach the best topic that contains the selected entry IDs with `mode: "scoped"`; this enables fact linking and structured comparisons without adding the broad-summary prefix or weakening the specific evidence gate.

- [ ] **Step 6: Remove exact broad-question routing as an acceptance dependency**

Delete the forced `SKILL_TOOLS_OVERVIEW_TITLE` query injection and do not require `isSkillToolsOverviewQuery` for broad acceptance. Keep `skill-tools-overview` as a normal child evidence entry and preserve safe aliases for lexical fallback, but topic recognition must work when an exact alias is absent.

- [ ] **Step 7: Run the full retrieval test**

Run the Step 2 command. Expected: all historical tests plus the generated matrix and safety cases PASS; broad-topic recall is at least 95%, strict unknown false accepts are zero, and project isolation is 100%.

- [ ] **Step 8: Commit retrieval integration**

```powershell
git add netlify/functions/_shared/retrieval.ts netlify/functions/_shared/retrieval.test.ts
git commit -m "feat: aggregate broad rag topics safely"
```

### Task 6: Hybrid Orchestration, Index Validation, and Health Metadata

**Files:**
- Modify: `netlify/functions/_shared/hybrid-retrieval.ts`
- Modify: `netlify/functions/_shared/hybrid-retrieval.test.ts`
- Modify: `netlify/functions/health.ts`
- Modify: `netlify/functions/_shared/health.test.ts`

**Interfaces:**
- Consumes: vector index schema v2 and `RetrievalResult.topic`.
- Produces: validated topic embeddings, `indexTopicCount`, safe topic diagnostics, lexical fallback on any index mismatch.

- [ ] **Step 1: Add failing hybrid and health assertions**

Assert that a valid schema-v2 index passes both entry and topic embeddings into retrieval, while each new topic mismatch bypasses the embedder and uses lexical fallback. Add health assertions:

```ts
assert.equal(payload.knowledge.topicCount, 5);
assert.equal(payload.retrieval.indexTopicCount, 5);
assert.equal(payload.retrieval.indexReady, true);
```

Ensure serialized diagnostics contain topic title, evidence count, and score but do not contain topic description, entry content, vectors, local paths, or prompts.

- [ ] **Step 2: Run hybrid and health tests and verify failure**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/hybrid-retrieval.test.ts netlify/functions/_shared/health.test.ts
```

Purpose: verify runtime validation has not yet learned vector schema v2. Expected: FAIL on topic validation and metadata.

- [ ] **Step 3: Validate topic index identity and vectors**

Extend `ValidatedVectorIndex`:

```ts
type ValidatedVectorIndex = {
  documentEmbeddings: Readonly<Record<string, readonly number[]>>;
  entryCount: number;
  knowledgeVersion: string;
  topicCount: number;
  topicEmbeddings: Readonly<Record<string, readonly number[]>>;
};
```

Require `schemaVersion === 2`, exact public entry IDs, exact public topic IDs, declared counts, 512 finite dimensions, matching model, and knowledge `1.3.0`. Any failure returns lexical fallback before loading the model. Pass `topicEmbeddings` into `retrieveKnowledge` with the query vector.

- [ ] **Step 4: Add safe metadata and diagnostics**

Extend `HybridRetrievalMetadata` with `indexTopicCount`. Extend candidate diagnostics with optional safe fields:

```ts
topic?: { evidenceCount: number; score: number; title: string };
```

Publish only rounded scores and public titles. `getKnowledgeMetadata()` returns `topicCount`; `/api/health` exposes only counts, versions, model name, dimension, mode, and readiness.

- [ ] **Step 5: Run hybrid and health tests**

Run Step 2. Expected: all tests PASS, including fallback and privacy assertions.

- [ ] **Step 6: Commit orchestration and health metadata**

```powershell
git add netlify/functions/_shared/hybrid-retrieval.ts netlify/functions/_shared/hybrid-retrieval.test.ts netlify/functions/health.ts netlify/functions/_shared/health.test.ts
git commit -m "feat: validate rag topic vector runtime"
```

### Task 7: Grounded Answer Composition with Fact Derivation

**Files:**
- Modify: `netlify/functions/_shared/ask-core.ts`
- Modify: `netlify/functions/_shared/ask-core.test.ts`
- Modify: `netlify/functions/ask.ts`
- Modify: `netlify/functions/_shared/ask.test.ts`
- Modify: `src/lib/retrieval-trace-display.ts`
- Modify: `src/lib/retrieval-trace-display.test.ts`

**Interfaces:**
- Consumes: accepted topic, selected hits, `deriveFacts`, optional injected clock.
- Produces: structured model claims mapped to allowed source IDs, a grounded evidence envelope with `factDerivations`, deterministic public-summary prefix, and safe trace fields.

- [ ] **Step 1: Write failing answer behavior tests**

Add an accepted work-topic fixture and capture `GroundedModelInput`:

```ts
const workEvidence = publicEntries.filter((entry) => ["work-overview", "work-lanjian-edge-ai", "work-focusmedia-player"].includes(entry.id));
const acceptedWorkTopicExecution: RetrievalResult = {
  accepted: true,
  coverage: 0.82,
  hits: workEvidence.map((entry, index) => ({
    coverage: 0.82 - index * 0.05,
    entry,
    gramMatches: 2,
    phraseMatches: 1,
    score: 8 - index,
    strongMatches: 2
  })),
  query: "概括你的测试工作经验",
  reason: "accepted",
  topic: { evidenceCount: 3, id: "work-experience", mode: "overview", score: 0.78, title: "工作经验公开概括" }
};

test("broad work answer receives fact derivations and a server-owned prefix", async () => {
  let capturedEvidence = "";
  const response = await answerKnowledgeQuestion(
    { question: "概括你的测试工作经验", conversation: [] },
    async ({ evidence }) => {
      capturedEvidence = evidence;
      return {
        claims: [{
          sourceEntryIds: ["work-overview", "work-lanjian-edge-ai", "work-focusmedia-player"],
          text: "公开经历覆盖软硬件结合、设备、边缘 AI 工控机和金融软件测试。"
        }]
      };
    },
    async () => acceptedWorkTopicExecution,
    { now: () => new Date("2026-08-12T04:00:00.000Z") }
  );

  assert.match(response.answer, /^以下基于个人网站中的公开资料概括。/);
  assert.match(response.answer, /8 年 7 个月/);
  assert.match(capturedEvidence, /"factDerivations"/);
  assert.match(capturedEvidence, /"career-span"/);
  assert.equal(response.retrievalTrace.factDerivationTypes?.includes("duration"), true);
});
```

Add tests proving: a specific accepted project answer has no broad prefix; the server removes a model claim with an unknown source ID; the server removes a model-written conflicting duration and prepends the exact server duration sentence; an output with no valid claim throws `模型没有返回可验证回答`; unknown questions never call derivation/model; and public traces do not expose derivation inputs or knowledge content.

- [ ] **Step 2: Run answer tests and verify failure**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\node.exe" --test netlify/functions/_shared/ask-core.test.ts netlify/functions/_shared/ask.test.ts src/lib/retrieval-trace-display.test.ts
```

Purpose: demonstrate that the current answer layer neither derives facts nor owns the prefix. Expected: new assertions FAIL.

- [ ] **Step 3: Inject the deterministic clock and build a typed evidence envelope**

Add:

```ts
export type AnswerKnowledgeOptions = { now?: () => Date };

export type GroundedModelClaim = { sourceEntryIds: string[]; text: string };
export type GroundedModelOutput = { claims: GroundedModelClaim[] };
export type GenerateGroundedAnswer = (input: GroundedModelInput) => Promise<GroundedModelOutput>;

type GroundedEvidenceEnvelope = {
  entries: Array<{ company: string; content: string; period: string; role: string; source_id: string; title: string; topics: string[] }>;
  factDerivations: FactDerivation[];
  topic?: { id: string; title: string };
};
```

Change `answerKnowledgeQuestion` to accept a fourth `options` parameter. After accepted retrieval with topic metadata, resolve the topic from `publicTopics`, call `deriveFacts({ entries: hits.map(...), now: options.now?.() ?? new Date(), question, topic })`, and serialize the envelope. An accepted legacy result without a topic uses an empty derivation array. Existing callers remain valid because the parameter is optional.

- [ ] **Step 4: Require source-mapped structured model claims**

In `ask.ts`, request strict Responses API structured output:

```ts
text: {
  format: {
    type: "json_schema",
    name: "grounded_personal_experience_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["claims"],
      properties: {
        claims: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "sourceEntryIds"],
            properties: {
              text: { type: "string", minLength: 1, maxLength: 1200 },
              sourceEntryIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } }
            }
          }
        }
      }
    }
  }
}
```

Parse `response.output_text` as JSON and validate the same shape at runtime. In `ask-core.ts`, keep only claims whose every `sourceEntryIds` value belongs to the accepted retrieval hits; deduplicate IDs and claim text, limit to eight claims/6,000 characters, and join their text in returned order. This creates a machine-checkable source mapping rather than trusting an unstructured paragraph. It does not prove the model's interpretation by itself, so the prompt must still require literal support from those sources and the test corpus must check unsupported details.

- [ ] **Step 5: Make the public-summary prefix and duration server-owned**

Use constants:

```ts
const PUBLIC_OVERVIEW_PREFIX = "以下基于个人网站中的公开资料概括。";
```

Build server-controlled statements as follows: add the public-summary prefix only when `retrieval.topic.mode === "overview"`; add a valid deterministic fact such as `career-span` whenever the applicable rule ran, including scoped questions.

```ts
const careerSpan = facts.find((fact) => fact.id === "career-span")?.statement;
const serverStatements = [retrieval.topic?.mode === "overview" ? PUBLIC_OVERVIEW_PREFIX : undefined, careerSpan].filter(Boolean);
const answer = [...serverStatements, ...validatedClaims.map((claim) => claim.text)].join("\n");
```

Before joining, remove any complete claim matching `(?:连续)?工作.{0,8}\d+\s*年` or `从业.{0,8}\d+\s*年` when a server `career-span` exists. This prevents the model from presenting a conflicting duration. If no claims remain, throw `模型没有返回可验证回答`. Add a comment explaining why computed numbers are composed by the server rather than trusted to the model.

- [ ] **Step 6: Strengthen the system prompt and safe trace**

Add prompt rules: `FACT_DERIVATIONS_JSON` values are server-computed; do not change numeric values; describe career time only as “从业跨度”; each claim must list every source entry that supports it; omit a claim rather than attaching an unrelated ID. Extend public trace schema to version 2 with optional `topicTitle`, `topicEvidenceCount`, and `factDerivationTypes`; update the front-end display whitelist without exposing statements, values, source IDs, or rule inputs.

- [ ] **Step 7: Run answer and trace tests**

Run Step 2. Expected: all tests PASS, broad responses have one prefix, duration is exact, specific responses remain unchanged, and traces remain sanitized.

- [ ] **Step 8: Commit answer integration**

```powershell
git add netlify/functions/_shared/ask-core.ts netlify/functions/_shared/ask-core.test.ts netlify/functions/ask.ts netlify/functions/_shared/ask.test.ts src/lib/retrieval-trace-display.ts src/lib/retrieval-trace-display.test.ts
git commit -m "feat: ground answers with fact derivation"
```

### Task 8: Real-Vector Evaluation and Endpoint Verification

**Files:**
- Modify: `scripts/evaluate-hybrid-retrieval.mjs`
- Modify: `scripts/verify-rag.mjs`

**Interfaces:**
- Consumes: real schema-v2 local vector index and deployed/local API responses.
- Produces: deterministic recall/safety/isolation metrics and endpoint assertions.

- [ ] **Step 1: Add failing evaluation gates**

Replace the hand-maintained broad positive list with a deterministic matrix generator:

```js
const broadTopicCases = [
  { topicId: "testing-skills", subjects: ["测试", "测试技能", "测试能力", "软件测试经验"] },
  { topicId: "tools-technology", subjects: ["工具", "测试工具", "技术栈", "开发工具"] },
  { topicId: "work-experience", subjects: ["工作经验", "测试工作经验", "职业经历", "公司经历"] },
  { topicId: "ai-workflow", subjects: ["AI 工作流", "Codex 使用经验", "人工智能工具经验"] },
  { topicId: "personal-projects", subjects: ["个人项目", "业余项目", "项目经历"] }
];
const prefixes = ["", "你", "您", "杨烨齐"];
const forms = [
  (prefix, subject) => `${prefix}${prefix ? "有" : ""}哪些${subject}？`,
  (prefix, subject) => `请介绍一下${prefix ? `${prefix}的` : ""}${subject}`,
  (prefix, subject) => `${subject}方面${prefix || "你"}会什么`
];
const generatedBroadCases = broadTopicCases.flatMap(({ topicId, subjects }) => subjects.flatMap((subject) => prefixes.flatMap((prefix) => forms.map((form) => [form(prefix, subject), topicId]))));
```

Track three metrics independently: broad topic recall, unknown-specific false answers, and project isolation. Fail unless recall is at least `0.95`, false answers equal `0`, and isolation equals `1.0`.

- [ ] **Step 2: Run the real-vector evaluation and verify failures are visible**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
$env:Path="$nodeDir;$env:Path"
& "$nodeDir\npm.cmd" run evaluate:rag
```

Purpose: exercise actual local BGE query embeddings rather than synthetic fixtures. Expected before final calibration: the command prints each failed query and exits non-zero if any metric misses its gate.

- [ ] **Step 3: Calibrate only fixed topic normalization when the whole corpus remains safe**

If the exact constants from Task 4 miss recall, change only `MIN_HYBRID_TOPIC_SCORE`, `MIN_LEXICAL_TOPIC_SCORE`, or the fixed semantic normalization floor/range. After every change, rerun the entire positive, unknown, and project corpus. Accept a calibration only when all three required metrics pass; never change the direct-claim gate or per-query aliases to make a single case pass. Record the final constants in `docs/OPERATIONS.md` during Task 9.

- [ ] **Step 4: Extend endpoint verification**

Make `verify-rag.mjs` send and assert:

```js
[
  { question: "请概括你的测试工作经验", answer: /公开资料概括/, source: /公开工作经历概览/, derived: /从业跨度/ },
  { question: "你有哪些测试工具？", answer: /公开资料概括/, source: /技能与工具公开概览/ },
  { question: "你会 Selenium 吗？", refusal: /没有足够信息/, noSources: true },
  { question: "养老金项目用了 Codex 吗？", refusal: /没有足够信息/, noSources: true }
]
```

The script must accept a base URL argument/environment, explain each check in console output, and exit non-zero on any unexpected answer/source/trace field.

- [ ] **Step 5: Run real-vector evaluation again**

Run Step 2. Expected: broad recall `>=95%`, unknown-specific false answers `0`, project isolation `100%`, all existing detailed cases PASS.

- [ ] **Step 6: Commit evaluation and verification**

```powershell
git add scripts/evaluate-hybrid-retrieval.mjs scripts/verify-rag.mjs netlify/functions/_shared/topic-retrieval.ts
git commit -m "test: evaluate generalized rag topic behavior"
```

### Task 9: Version, Documentation, Full Verification, and Handoff

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `VERSION`
- Modify: `README.md`
- Modify: `knowledge/README.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: all implemented behavior and final calibrated constants.
- Produces: version `0.3.0`, operator instructions, release notes, and evidence-backed completion report.

- [ ] **Step 1: Bump the compatible feature version without installing packages**

Run:

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
& "$nodeDir\npm.cmd" version 0.3.0 --no-git-tag-version
```

Then use `apply_patch` for the repository version file:

```diff
*** Begin Patch
*** Update File: VERSION
@@
-0.2.3
+0.3.0
*** End Patch
```

Purpose: synchronize package metadata and the repository version file without creating a tag or publishing. Expected: only `package.json`, `package-lock.json`, and `VERSION` change.

- [ ] **Step 2: Document operator behavior and command purpose**

Update documentation with:

- Topic aggregation formula and final fixed thresholds.
- Why absolute topic strength replaces margin only for broad questions.
- Why explicit claims and project scope still block aggregation.
- Fact-derivation types, `Asia/Shanghai`, elapsed-month formula, source tracking, and failure behavior.
- `vectors:build`: validates local model/knowledge and generates entry/topic vectors.
- `test`: runs deterministic unit and integration tests.
- `evaluate:rag`: loads the real local BGE model and verifies recall/safety/isolation.
- `build`: type-checks both app/functions and produces the Vite bundle.
- `verify:rag`: sends end-to-end API questions to a local or authorized Draft URL.
- Draft and production deployment remain separate explicit operations.

Add a `0.3.0` changelog entry describing behavior changes, safety guarantees, test metrics, knowledge `1.3.0`, and vector schema v2.

- [ ] **Step 3: Run the complete deterministic test suite**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
$env:Path="$nodeDir;$env:Path"
& "$nodeDir\npm.cmd" test
```

Purpose: run every RAG, endpoint, health, trace, topic, schema, and fact test. Expected: all tests PASS with zero failures.

- [ ] **Step 4: Run type checks and production build**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
$env:Path="$nodeDir;$env:Path"
& "$nodeDir\npm.cmd" run typecheck
& "$nodeDir\npm.cmd" run build
```

Purpose: verify TypeScript contracts in both browser and Netlify code, then confirm the production bundle includes the updated assistant. Expected: both commands exit `0` and Vite reports a successful build.

- [ ] **Step 5: Rebuild and evaluate the final real index**

```powershell
$nodeDir='D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64'
$env:Path="$nodeDir;$env:Path"
& "$nodeDir\npm.cmd" run vectors:build
& "$nodeDir\npm.cmd" run evaluate:rag
```

Purpose: ensure the committed index exactly matches final knowledge and exercise true BGE retrieval. Expected: schema v2, knowledge `1.3.0`, 16 entries, 5 topics, recall `>=95%`, false answers `0`, isolation `100%`.

- [ ] **Step 6: Check only intended paths and whitespace**

```powershell
git status --short
git diff --check
git diff --name-only
```

Purpose: identify unrelated user changes and whitespace errors before staging. Expected: `.codex/config.toml` and `outputs/` remain unstaged and unchanged by this work.

- [ ] **Step 7: Commit documentation and version metadata**

```powershell
git add package.json package-lock.json VERSION README.md knowledge/README.md docs/OPERATIONS.md CHANGELOG.md knowledge/vector-index.json
git commit -m "docs: release rag topic aggregation v0.3.0"
```

- [ ] **Step 8: Request code review and apply only verified findings**

Use `superpowers:requesting-code-review`, review the complete diff against the confirmed spec, and rerun Steps 3–6 after any accepted fix. Purpose: obtain an independent scope/safety review before claiming completion.

- [ ] **Step 9: Prepare the user handoff without deploying**

Return:

- The outcome and the exact retrieval/fact behavior now supported.
- Test counts, real-vector metrics, type-check/build results, and any limitations.
- Clickable absolute links to every modified path, grouped by knowledge, retrieval, fact derivation, answer layer, tests/scripts, and documentation.
- An explanation of each important command and what service goal it verifies.
- A statement that no Draft or production deployment occurred.
- A separate request for authorization if the user wants a new Netlify Draft Preview.
