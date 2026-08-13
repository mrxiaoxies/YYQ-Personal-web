import type { KnowledgeEntry, KnowledgeTopic } from "./knowledge-schema.ts";

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

type ResolvedFactContext = Omit<FactDerivationContext, "now" | "timeZone"> & {
  now: Date;
  timeZone: "Asia/Shanghai";
};

type FactRule = (context: ResolvedFactContext) => FactDerivation[];

const YEAR_MONTH = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/;
const KNOWN_CHINESE_ENTITY_TERMS = ["前端控制台"] as const;

function fact(
  context: ResolvedFactContext,
  value: Omit<FactDerivation, "ruleVersion" | "topicId">
): FactDerivation {
  return { ...value, ruleVersion: "1", topicId: context.topic.id };
}

function currentShanghaiMonth(now: Date) {
  if (Number.isNaN(now.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return Number.isInteger(year) && Number.isInteger(month) ? { month, year } : undefined;
}

function deriveCareerSpan(context: ResolvedFactContext): FactDerivation[] {
  if (context.topic.id !== "work-experience" && !/(?:工作|从业|职业|测试经验|几年|多久)/.test(context.question)) {
    return [];
  }
  const timelineSources = context.entries.filter((entry) => entry.employmentPeriods?.length);
  // 多份时间线可能相互冲突；事实推导宁可省略，也不静默选择其中一份。
  if (timelineSources.length !== 1) return [];
  const source = timelineSources[0];
  const starts = source.employmentPeriods
    ?.map((period) => period.startMonth)
    .filter((month) => YEAR_MONTH.test(month))
    .sort();
  const start = starts?.[0];
  const current = currentShanghaiMonth(context.now);
  if (!start || !current) return [];
  const [startYear, startMonth] = start.split("-").map(Number);
  // 不加 1：2018-01 到 2026-08 是经过 103 个月，即 8 年 7 个月；包含式计数会多算整整一个月。
  const totalMonths = (current.year - startYear) * 12 + current.month - startMonth;
  if (!Number.isInteger(totalMonths) || totalMonths < 0) return [];
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const label =
    [years ? `${years} 年` : "", months ? `${months} 个月` : ""].filter(Boolean).join(" ") ||
    "不足 1 个月";
  return [
    fact(context, {
      id: "career-span",
      sourceEntryIds: [source.id],
      statement: `按最早公开工作月份 ${start} 计算，截至当前上海月份，公开经历的从业跨度为 ${label}。`,
      type: "duration",
      value: { months, totalMonths, years }
    })
  ];
}

function deriveEvidenceCount(context: ResolvedFactContext): FactDerivation[] {
  const sourceEntryIds = [...new Set(context.entries.map((entry) => entry.id))];
  if (sourceEntryIds.length < 2) return [];
  return [
    fact(context, {
      id: "evidence-count",
      sourceEntryIds,
      statement: `本次概括基于 ${sourceEntryIds.length} 条公开资料。`,
      type: "count",
      value: sourceEntryIds.length
    })
  ];
}

function deriveCategoryGroups(context: ResolvedFactContext): FactDerivation[] {
  const categories = [...new Set(context.entries.map((entry) => entry.category))].sort();
  const groups = Object.fromEntries(
    categories.map((category) => [
      category,
      context.entries.filter((entry) => entry.category === category).map((entry) => entry.id)
    ])
  );
  const sourceEntryIds = [...new Set(Object.values(groups).flat())];
  if (sourceEntryIds.length < 2) return [];
  return [
    fact(context, {
      id: "evidence-groups",
      sourceEntryIds,
      statement: "公开证据已按知识类别分组，供回答进行跨条目归纳。",
      type: "group",
      value: groups
    })
  ];
}

function queryEntities(question: string) {
  return [
    ...new Set([
      ...(question.match(/[A-Za-z][A-Za-z0-9.+#-]{1,}/g) ?? []),
      ...KNOWN_CHINESE_ENTITY_TERMS.filter((term) => question.includes(term))
    ])
  ];
}

function deriveExplicitEntityLinks(context: ResolvedFactContext): FactDerivation[] {
  return queryEntities(context.question).flatMap((entity) => {
    const normalized = entity.toLowerCase();
    const sources = context.entries.filter((entry) =>
      [entry.title, entry.content, ...entry.tags, ...entry.aliases].join("\n").toLowerCase().includes(normalized)
    );
    if (sources.length === 0) return [];
    const sourceEntryIds = sources.map((entry) => entry.id);
    return [
      fact(context, {
        id: `entity-link:${normalized}`,
        sourceEntryIds,
        statement: `公开资料在 ${sources.length} 条证据中明确提到 ${entity}。`,
        type: "link",
        value: { entity, sourceEntryIds }
      })
    ];
  });
}

function deriveEmploymentTimeline(context: ResolvedFactContext): FactDerivation[] {
  const timelineSources = context.entries.filter((entry) => entry.employmentPeriods?.length);
  if (timelineSources.length !== 1) return [];
  const source = timelineSources[0];
  return [
    fact(context, {
      id: "employment-timeline",
      sourceEntryIds: [source.id],
      statement: "公开工作经历可以按结构化起止月份和岗位顺序进行阶段比较。",
      type: "compare",
      value: source.employmentPeriods
    })
  ];
}

function deriveTopicEvidenceSummary(context: ResolvedFactContext): FactDerivation[] {
  if (context.entries.length < 2) return [];
  const sourceEntryIds = context.entries.map((entry) => entry.id);
  return [
    fact(context, {
      id: "topic-evidence-summary",
      sourceEntryIds,
      statement: `以下结构化资料用于概括“${context.topic.title}”，它本身不新增简历事实。`,
      type: "summarize",
      value: context.entries.map(({ company, id, period, role, title }) => ({
        company,
        period,
        role,
        sourceEntryId: id,
        title
      }))
    })
  ];
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
    (derived) =>
      derived.sourceEntryIds.length > 0 &&
      derived.sourceEntryIds.every((id) => safeEntries.some((entry) => entry.id === id))
  );
}
