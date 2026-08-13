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

const YEAR_MONTH = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/;
const TOPIC_CATEGORIES = new Set(["skill", "tool", "work", "ai", "project"]);

function nonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空字符串`);
  return value.trim();
}

function strings(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${field} 必须是非空字符串数组`);
  }
  return value.map((item) => String(item).trim());
}

function parseEmploymentPeriods(value: unknown, entryId: string): EmploymentPeriod[] {
  if (!Array.isArray(value)) throw new Error(`${entryId}.employmentPeriods 必须是数组`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${entryId}.employmentPeriods[${index}] 无效`);
    }
    const period = item as Record<string, unknown>;
    const company = nonEmptyString(period.company, `${entryId}.employmentPeriods[${index}].company`);
    const role = nonEmptyString(period.role, `${entryId}.employmentPeriods[${index}].role`);
    const startMonth = nonEmptyString(period.startMonth, `${entryId}.employmentPeriods[${index}].startMonth`);
    const endMonth = nonEmptyString(period.endMonth, `${entryId}.employmentPeriods[${index}].endMonth`);
    if (!YEAR_MONTH.test(startMonth)) throw new Error(`${startMonth} 不是有效的起始月份`);
    if (endMonth !== "present" && !YEAR_MONTH.test(endMonth)) {
      throw new Error(`${endMonth} 不是有效的结束月份`);
    }
    return { company, endMonth, role, startMonth };
  });
}

function parseEntries(value: unknown[]) {
  const entries = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`知识条目 ${index + 1} 无效`);
    const entry = item as Record<string, unknown>;
    const visibility = nonEmptyString(entry.visibility, `知识条目 ${index + 1}.visibility`);
    if (visibility !== "public" && visibility !== "private") {
      throw new Error(`知识条目 ${index + 1}.visibility 无效`);
    }
    return {
      aliases: strings(entry.aliases, `${entry.id}.aliases`),
      category: nonEmptyString(entry.category, `${entry.id}.category`),
      company: typeof entry.company === "string" ? entry.company : "",
      content: nonEmptyString(entry.content, `${entry.id}.content`),
      ...(entry.employmentPeriods === undefined
        ? {}
        : { employmentPeriods: parseEmploymentPeriods(entry.employmentPeriods, String(entry.id)) }),
      id: nonEmptyString(entry.id, `知识条目 ${index + 1}.id`),
      period: typeof entry.period === "string" ? entry.period : "",
      role: typeof entry.role === "string" ? entry.role : "",
      tags: strings(entry.tags, `${entry.id}.tags`),
      title: nonEmptyString(entry.title, `${entry.id}.title`),
      visibility
    } satisfies KnowledgeEntry;
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error("知识条目 ID 重复");
  return entries;
}

function parseTopics(value: unknown[], publicIds: ReadonlySet<string>) {
  const topics = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`主题 ${index + 1} 无效`);
    const topic = item as Record<string, unknown>;
    const id = nonEmptyString(topic.id, `主题 ${index + 1}.id`);
    const category = nonEmptyString(topic.category, `${id}.category`);
    if (!TOPIC_CATEGORIES.has(category)) throw new Error(`${id}.category 无效`);
    const entryIds = strings(topic.entryIds, `${id}.entryIds`);
    // 主题总览只允许聚合公开条目，避免宽泛问法把私有资料带入模型上下文。
    const missingId = entryIds.find((entryId) => !publicIds.has(entryId));
    if (missingId) throw new Error(`主题 ${id} 引用了非公开或不存在的条目 ${missingId}`);
    const overviewEntryId = typeof topic.overviewEntryId === "string" ? topic.overviewEntryId : undefined;
    if (overviewEntryId && !entryIds.includes(overviewEntryId)) {
      throw new Error(`主题 ${id} 的 overviewEntryId 不在 entryIds 中`);
    }
    return {
      category: category as KnowledgeTopic["category"],
      description: nonEmptyString(topic.description, `${id}.description`),
      entryIds,
      id,
      lexicalAnchors: strings(topic.lexicalAnchors, `${id}.lexicalAnchors`),
      ...(overviewEntryId ? { overviewEntryId } : {}),
      title: nonEmptyString(topic.title, `${id}.title`)
    } satisfies KnowledgeTopic;
  });
  if (new Set(topics.map((topic) => topic.id)).size !== topics.length) throw new Error("主题 ID 重复");
  return topics;
}

export function parseKnowledgeDocument(value: unknown): KnowledgeDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("知识库必须是对象");
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.entries) || !Array.isArray(source.topics)) {
    throw new Error("知识库缺少 entries 或 topics");
  }
  const entries = parseEntries(source.entries);
  const publicIds = new Set(entries.filter((entry) => entry.visibility === "public").map((entry) => entry.id));
  return {
    entries,
    topics: parseTopics(source.topics, publicIds),
    updatedAt: nonEmptyString(source.updatedAt, "知识库 updatedAt"),
    version: nonEmptyString(source.version, "知识库 version")
  };
}
