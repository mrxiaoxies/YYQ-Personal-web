import { knowledgeDocument, publicEntries, publicTopics } from "./knowledge-data.ts";
import { rankKnowledgeTopics, type TopicSemanticInput } from "./topic-retrieval.ts";
export type { KnowledgeEntry } from "./knowledge-schema.ts";
import type { KnowledgeEntry } from "./knowledge-schema.ts";

export type RetrievalHit = {
  coverage: number;
  entry: KnowledgeEntry;
  gramMatches: number;
  phraseMatches: number;
  score: number;
  semanticSimilarity?: number;
  strongMatches: number;
};

export type RetrievalResult = {
  accepted: boolean;
  coverage: number;
  hits: RetrievalHit[];
  query: string;
  reason: "accepted" | "ambiguous" | "insufficient-evidence" | "no-meaningful-query";
  topic?: RetrievalTopicResult;
};

export type RetrievalTopicResult = {
  evidenceCount: number;
  id: string;
  mode: "overview" | "scoped";
  score: number;
  title: string;
};

export type EmbeddingVector = readonly number[] | Float32Array;

export type SemanticRetrievalInput = {
  dimensions: number;
  documentEmbeddings: Readonly<Record<string, EmbeddingVector>>;
  knowledgeVersion: string;
  model: string;
  queryEmbedding: EmbeddingVector;
  topicEmbeddings?: Readonly<Record<string, EmbeddingVector>>;
};

export type RetrievalOptions = {
  limit?: number;
  semantic?: SemanticRetrievalInput;
};

type IndexedEntry = {
  entry: KnowledgeEntry;
  length: number;
  normalizedAliases: string[];
  normalizedTags: string[];
  normalizedTitle: string;
  terms: Map<string, number>;
};

type QueryFeature = {
  token: string;
  weight: number;
};

type SemanticHit = {
  entry: KnowledgeEntry;
  similarity: number;
};

type HybridCandidate = {
  entry: KnowledgeEntry;
  lexical?: RetrievalHit;
  rrfScore: number;
  semantic?: SemanticHit;
};

export const SEMANTIC_EMBEDDING_DIMENSIONS = 512;
export const SEMANTIC_EMBEDDING_MODEL = "bge-small-zh-v1.5";

const LEXICAL_RRF_WEIGHT = 0.55;
const SEMANTIC_RRF_WEIGHT = 0.45;
const RRF_K = 60;
const MIN_SEMANTIC_SIMILARITY = 0.45;
const MIN_SEMANTIC_MARGIN = 0.015;
const MIN_VECTOR_ONLY_SIMILARITY = 0.52;
const MIN_VECTOR_ONLY_MARGIN = 0.02;
const MAX_SEMANTIC_HIT_GAP = 0.08;
const SKILL_TOOLS_OVERVIEW_ENTRY_ID = "skill-tools-overview";
const SKILL_TOOLS_OVERVIEW_TITLE = "技能与工具公开概览";

const STOP_PHRASES = new Set([
  "一下",
  "介绍",
  "介绍一下",
  "什么",
  "什么样",
  "你会",
  "你做",
  "你的",
  "哪些",
  "如何",
  "怎么样",
  "怎么",
  "是否",
  "有过",
  "有没有",
  "相关",
  "经验",
  "能力",
  "负责",
  "这个",
  "那个",
  "项目",
  "工作",
  "技术",
  "方法",
  "问题",
  "使用"
]);

const ENGLISH_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "me",
  "my",
  "of",
  "on",
  "tell",
  "the",
  "to",
  "vs",
  "what",
  "with",
  "you",
  "your"
]);

const SYNONYMS = [
  ["排查日志", "日志定位"],
  ["查看日志", "日志定位"],
  ["看日志", "日志定位"],
  ["查日志", "日志定位"],
  ["浏览器控制台", "前端控制台"],
  ["查出异常", "问题定位"],
  ["返回不对", "问题定位"],
  ["接口返回怪怪的", "接口问题定位"],
  ["找原因", "问题定位"],
  ["部署环境", "环境搭建"],
  ["搭建环境", "环境搭建"],
  ["搭环境", "环境搭建"],
  ["接口联调", "接口测试"],
  ["api 测试", "接口测试"],
  ["api测试", "接口测试"],
  ["边缘 ai 设备", "边缘计算设备"],
  ["稳定性验证", "压力测试"],
  ["跑久了", "压力测试"],
  ["个人站", "个人网站"],
  ["站点", "个人网站"],
  ["网页", "个人网站"],
  ["你的站", "个人网站"],
  ["改代码到发布", "网站发布流程"],
  ["广告播放器", "广告机"],
  ["播放器", "广告机"],
  ["直播推送", "直播流"],
  ["串口命令", "串口指令"],
  ["输入边界", "边界值"],
  ["异常场景", "错误处理"],
  ["从需求走到回归", "业务流程测试"],
  ["需求走到回归", "业务流程测试"],
  ["养老那块", "养老金"],
  ["养老业务", "养老金"],
  ["两套数据来源", "双数据源"],
  ["上传下载链路", "上传签发下载"],
  ["回错人", "误发消息"],
  ["发错人", "误发消息"],
  ["认出人员", "人员识别"],
  ["镜头拍到人", "人员识别"],
  ["消息通知", "通知流程"],
  ["检查密封", "密封测试"],
  ["剪辑流水线", "自动剪辑"],
  ["自动剪视频", "自动剪辑"],
  ["公司和岗位", "工作经历"],
  ["压测", "压力测试"],
  ["lr 性能测试", "loadrunner 性能测试"],
  ["lr性能测试", "loadrunner性能测试"]
] as const;

const EXPERIENCE_INTENT_PATTERNS = [
  /(?:经历|经验|能力|技术栈|做过|负责|参与|用过|使用过|用了|做了|做到|进展|阶段)/,
  /(?:怎么|如何|怎样|从哪里).{0,12}(?:测试|验证|检查|排查|定位|搭建|维护|优化|开发|实现|发布|上线|处理|解决|通知|覆盖|避免)/,
  /(?:测试|验证|检查|排查|定位|搭建|维护|优化|开发|实现|发布|上线|处理|解决|通知|覆盖).{0,12}(?:什么|哪些|怎么|如何|怎样|没|过|了|情况|步骤|流程|问题|点)/,
  /(?:测过|测了|测吗|查起|问题定位|误发消息|压力测试)/,
  /(?:怎么|如何|怎样).{0,12}(?:确认|验证|验|测试|测)/,
  /(?:你|您|他|杨烨齐|本人).{0,12}(?:做|用|会|负责|参与|擅长|熟悉|测试|验证|排查|定位|搭建|维护|开发|实现|优化)/
] as const;

const GENERIC_INFORMATION_PATTERNS = [
  /(?:什么是|是什么意思|基本原理|入门教程|使用教程)/,
  /(?:ai\s*)?工作流.{0,8}(?:怎么|如何|怎样).{0,8}(?:设计|搭建|实现)/,
  /(?:哪个|哪种).{0,8}(?:更好|最好|更值得)/,
  /(?:会|能|将).{0,8}取代/,
  /(?:推荐|购买|售价|价格|怎么下载|如何下载)/,
  /(?:帮|替|给).{0,4}(?:我)?(?:写|生成|创建|编写)/
] as const;

const UNSUPPORTED_ENVIRONMENT_PATTERN = /(?:天气|气温|低温|高温|极寒|酷热).{0,16}(?:怎么|如何|怎样|测试|测|验证)/;

const PERSONAL_CONTEXT_PATTERN = /(?:你|您|杨烨齐|本人|他的|你的|平时|通常|做过|负责过|参与过|经历|经验|擅长|会不会|是否用过)/;
const GENERAL_ADVICE_PATTERN = /(?:怎么|如何|怎样|入门|教程|设计|优化|排查|上线|实现|学习|怎么做|如何做)/;
const CLAIM_REQUEST_PATTERNS = [
  /(?:你|您|本人).{0,8}(?:熟悉|掌握|常用|使用过|用过|会用(?!什么|哪些|怎么|如何|怎样)|会(?!怎么|如何|怎样|从哪|在哪|去哪|用什么|用哪些)|使用(?!什么|哪些|怎么|如何|怎样)|用(?!什么|哪些|怎么|如何|怎样))(.{2,36})/i,
  /(?:是不是|有没有|是否|支持|使用过|用过|采用|接入|做过|测过|发布到|能直接|可以直接|是用)(.{2,36})/i,
  /(?:项目|系统|网站|平台|工作流).{0,12}(?:会用|用过|用了|使用过|使用|采用|接入|用)(.{2,36})/i
] as const;
const CLAIM_FILLER_PATTERN = /(?:做过|测过|使用|采用|开发|实现|直接|有没有|是不是|是否|可以|能够|能不能)/g;
const GENERIC_PROJECT_ANCHORS = new Set([
  "前端项目",
  "数据库测试",
  "测试方法",
  "硬件兼容",
  "功能测试",
  "ai工作流",
  "工作流",
  "性能测试",
  "压力测试"
]);

const FIELD_WEIGHTS = {
  body: 1,
  metadata: 2,
  tag: 3,
  title: 4
} as const;

const K1 = 1.2;
const B = 0.66;
const MIN_SCORE = 2;
const MIN_STRONG_COVERAGE = 0.42;
const MIN_EXACT_PHRASE_COVERAGE = 0.28;
const MIN_GRAM_COVERAGE = 0.58;

function normalizeText(value: string) {
  let normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();

  for (const [from, to] of SYNONYMS) {
    normalized = normalized.replaceAll(from, to);
  }

  normalized = normalized
    .replace(/\bapi\b/g, "接口")
    .replace(/\bdebug(?:ging)?\b/g, "问题定位")
    .replace(/\blogs?\b/g, "日志")
    .replace(/\b(?:database|db)\b/g, "mysql")
    .replace(/\bconsole\b/g, "前端控制台");

  return normalized;
}

function compactText(value: string) {
  return normalizeText(value).replace(/[^a-z0-9+#.\u3400-\u9fff]+/g, "");
}

function isSkillToolsOverviewQuery(query: string) {
  const compact = compactText(query);
  const patterns = [
    /^(?:请)?(?:你|您|杨烨齐|本人)?(?:的)?(?:都|主要)?(?:有哪些|有什么|有些什么)?测试(?:技能)?(?:和|与|或|或者)工具(?:都|主要)?(?:有哪些|是什么|有些什么|包括什么|清单|概览)?(?:呢|吗)?$/,
    /^(?:请)?(?:做测试)?(?:你|您|杨烨齐|本人)?(?:都|主要|目前|平时|通常)?(?:会用|会|掌握|熟悉|擅长|常用|使用|用过|用)(?:哪些|什么|些什么|有什么)(?:技能(?:和|与|或|或者)工具|技能|工具|测试工具|技术栈|技术能力|测试能力|软件测试能力)(?:呢|吗)?$/,
    /^(?:你|您|杨烨齐|本人)?(?:的)?(?:技能(?:和|与|或|或者)工具|技能|工具|测试工具|技术栈|技术能力|测试能力|软件测试能力)(?:都|主要)?(?:有哪些|是什么|有些什么|包括什么|清单|概览)(?:呢|吗)?$/,
    /^(?:请)?(?:说说|介绍|列举)(?:一下)?(?:你|您|杨烨齐|本人)?(?:的)?(?:技能(?:和|与|或|或者)工具|技能|工具|测试工具|技术栈|技术能力|测试能力|软件测试能力)(?:清单|概览)?$/,
    /^(?:请)?(?:你|您|杨烨齐|本人)?(?:的)?(?:都|主要)?(?:有哪些|有什么|有些什么)(?:技能(?:和|与|或|或者)工具|技能|工具|测试工具|技术栈|技术能力|测试能力|软件测试能力)(?:呢|吗)?$/,
    /^(?:你|您|杨烨齐|本人)(?:都)?会(?:些)?什么(?:技能|工具)?(?:呢|吗)?$/,
    /^(?:你|您|杨烨齐|本人)(?:的)?(?:技能(?:和|与|或|或者)工具|技能|工具|测试工具|技术栈|技术能力|测试能力|软件测试能力)(?:清单|概览)?$/,
    /^(?:平时|通常|主要)?常用(?:的)?(?:技能|工具|测试工具|技术栈)(?:有哪些|是什么|呢|吗)?$/
  ] as const;

  return patterns.some((pattern) => pattern.test(compact));
}

const broadOverviewSubjects = new Set(
  publicTopics.flatMap((topic) => topic.lexicalAnchors.map((anchor) => compactText(anchor)))
);

function isBroadTopicOverviewQuery(query: string) {
  const compact = compactText(query);
  // The grammar stays fixed while the accepted subjects come from knowledge topics. Adding a new
  // public topic therefore broadens natural overview wording without adding question-by-question aliases.
  const subjectCandidates = [
    compact.match(/^(?:你|您|杨烨齐)?有?哪些(.+)$/)?.[1],
    compact.match(/^(?:你|您|杨烨齐)?会有哪些(.+)$/)?.[1],
    compact.match(/^(?:请)?(?:概括|介绍一下|介绍|说说|聊聊)(?:你|您|杨烨齐)?的?(.+)$/)?.[1],
    compact.match(/^(.+)方面(?:你|您|杨烨齐)?会什么$/)?.[1]
  ].filter((subject): subject is string => Boolean(subject));
  const hasNaturalOverviewSubject = /(?:测试方面|技能|工具|技术栈|能力|职业路线|工作经历|工作经验|从业经历|个人项目|业余|人工智能|ai工作流|codex)/i.test(compact);
  const hasNaturalOverviewAction = /(?:哪些|什么|概括|介绍|说说|聊聊|积累|一路走|做了些什么|怎样辅助|如何辅助)/.test(compact);
  const colloquialToolOverview = /(?:平时|通常|主要).*(?:拿|用).*(?:什么|哪些).*(?:干活|工作|做事)/.test(compact);
  return (
    subjectCandidates.some((subject) => broadOverviewSubjects.has(subject)) ||
    (hasNaturalOverviewSubject && hasNaturalOverviewAction) ||
    colloquialToolOverview
  );
}

function isMeaningfulPhrase(value: string) {
  const compact = compactText(value);
  if (!compact || STOP_PHRASES.has(compact)) return false;
  if (/^[a-z0-9+#.]+$/.test(compact)) return compact.length >= 2 && !ENGLISH_STOP_WORDS.has(compact);
  return compact.length >= 2;
}

const projectAnchorDocuments = new Map<string, Set<string>>();
for (const entry of publicEntries) {
  if (entry.category !== "work-project" && entry.category !== "personal-project") continue;
  for (const value of [entry.title, ...entry.aliases, ...entry.tags]) {
    const phrase = compactText(value);
    if (
      phrase.length < 3 ||
      !/[\u3400-\u9fff]/.test(phrase) ||
      GENERIC_PROJECT_ANCHORS.has(phrase)
    ) {
      continue;
    }
    const documents = projectAnchorDocuments.get(phrase) ?? new Set<string>();
    documents.add(entry.id);
    projectAnchorDocuments.set(phrase, documents);
  }
}

const specificProjectAnchors = Array.from(projectAnchorDocuments)
  .filter(([, documents]) => documents.size === 1)
  .map(([phrase]) => phrase)
  .sort((left, right) => right.length - left.length);

function hasSpecificProjectAnchor(query: string) {
  const compactQuery = compactText(query);
  return specificProjectAnchors.some((anchor) => compactQuery.includes(anchor));
}

function looksLikeGeneralAdvice(query: string, hasKeywordCombination: boolean) {
  return (
    GENERAL_ADVICE_PATTERN.test(query) &&
    !PERSONAL_CONTEXT_PATTERN.test(query) &&
    !hasSpecificProjectAnchor(query) &&
    !hasKeywordCombination
  );
}

const domainPhrases = Array.from(
  new Set(
    publicEntries
      .flatMap((entry) => [entry.title, entry.company, entry.role, ...entry.tags, ...entry.aliases])
      .map(compactText)
      .filter(isMeaningfulPhrase)
  )
).sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-CN"));

function addTerm(terms: Map<string, number>, token: string, weight: number) {
  if (!token || weight <= 0) return;
  terms.set(token, (terms.get(token) ?? 0) + weight);
}

function basicTokens(value: string) {
  const normalized = normalizeText(value);
  const tokens: string[] = [];

  for (const match of normalized.matchAll(/[a-z][a-z0-9+#._-]*|\d{4}(?:\.\d{1,2})?/g)) {
    const word = match[0].replace(/^_+|_+$/g, "");
    if (word.length >= 2 && !ENGLISH_STOP_WORDS.has(word)) tokens.push(`w:${word}`);
  }

  for (const match of normalized.matchAll(/[\u3400-\u9fff]+/g)) {
    const sequence = match[0];
    for (const size of [3, 2]) {
      if (sequence.length < size) continue;
      for (let index = 0; index <= sequence.length - size; index += 1) {
        const gram = sequence.slice(index, index + size);
        if (!STOP_PHRASES.has(gram)) tokens.push(`g${size}:${gram}`);
      }
    }
  }

  return tokens;
}

function phraseTokens(value: string) {
  const compact = compactText(value);
  return domainPhrases
    .filter((phrase) => !/^[a-z0-9+#.]+$/.test(phrase) && compact.includes(phrase))
    .map((phrase) => `p:${phrase}`);
}

function addField(terms: Map<string, number>, values: string[], weight: number, explicitPhrase = false) {
  for (const value of values) {
    if (!value) continue;
    if (explicitPhrase && isMeaningfulPhrase(value)) addTerm(terms, `p:${compactText(value)}`, weight * 1.25);
    for (const token of basicTokens(value)) addTerm(terms, token, weight);
    for (const token of phraseTokens(value)) addTerm(terms, token, weight);
  }
}

const index: IndexedEntry[] = publicEntries.map((entry) => {
  const terms = new Map<string, number>();
  addField(terms, [entry.content], FIELD_WEIGHTS.body);
  addField(terms, [entry.company, entry.role, entry.period, entry.category], FIELD_WEIGHTS.metadata, true);
  addField(terms, entry.tags, FIELD_WEIGHTS.tag, true);
  addField(terms, entry.aliases, FIELD_WEIGHTS.tag, true);
  addField(terms, [entry.title], FIELD_WEIGHTS.title, true);

  return {
    entry,
    length: Array.from(terms.values()).reduce((sum, value) => sum + value, 0),
    normalizedAliases: entry.aliases.map(compactText),
    normalizedTags: entry.tags.map(compactText),
    normalizedTitle: compactText(entry.title),
    terms
  };
});

const compactEntryEvidence = new Map(
  publicEntries.map((entry) => [
    entry.id,
    compactText(
      [entry.title, entry.company, entry.role, entry.period, ...entry.tags, ...entry.aliases, entry.content].join(" ")
    )
  ])
);

function hasUnsupportedLatinTermForEntry(query: string, entry: KnowledgeEntry) {
  const evidence = compactEntryEvidence.get(entry.id) ?? "";
  for (const match of query.matchAll(/[a-z][a-z0-9+#._-]*/g)) {
    const word = match[0].replace(/^_+|_+$/g, "");
    if (word.length < 2 || ENGLISH_STOP_WORDS.has(word)) continue;
    if (!evidence.includes(word)) return true;
  }
  return false;
}

function isBroadGenericClaim(value: string) {
  const compact = compactText(value)
    .replace(/^[了过]+/g, "")
    .replace(/[吗呢嘛了没]+$/g, "");
  if (/^(?:怎样|怎么|如何)$/.test(compact)) return true;
  if (/^(?:哪些|什么|些什么|技能|工具|技术|技术栈|能力|测试|项目|工作|经历|经验|工作流)$/.test(compact)) return true;
  return /^(?:哪些|什么|些什么)(?:(?:常用|公开|相关|主要|测试|开发|技术)?(?:技能|工具|技术|技术栈|技术能力|测试能力)|项目|工作|经历|经验|方法|步骤|流程|内容|问题)(?:(?:和|与|及|或|或者)(?:技能|工具|技术|技术栈|技术能力|测试能力))*$/.test(compact);
}

function extractRequestedClaim(query: string) {
  for (const pattern of CLAIM_REQUEST_PATTERNS) {
    const claim = query.match(pattern)?.[1]?.trim();
    if (claim) return claim;
  }
  return undefined;
}

function segmentSupportRatio(segment: string, evidence: string) {
  let compact = compactText(segment.replace(CLAIM_FILLER_PATTERN, ""))
    .replace(/^[了过]+/g, "")
    .replace(/[吗呢嘛了没]+$/g, "");
  if (compact.length < 2 || isBroadGenericClaim(compact)) return 1;
  compact = compact.replace(/^(?:哪些|什么|些什么)/, "");
  if (compact.length < 2) return 1;
  if (evidence.includes(compact)) return 1;

  const grams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  if (grams.size === 0) return 1;

  let supported = 0;
  for (const gram of grams) {
    if (evidence.includes(gram)) supported += 1;
  }
  return supported / grams.size;
}

function entrySupportsRequestedClaim(query: string, entry: KnowledgeEntry) {
  if (hasUnsupportedLatinTermForEntry(query, entry)) return false;

  const claim = extractRequestedClaim(query);
  if (!claim || isBroadGenericClaim(claim)) return true;

  const evidence = compactEntryEvidence.get(entry.id) ?? "";
  const segments = claim.split(/(?:和|与|及|、|还是|或)/).filter(Boolean);
  return segments.every((segment) => segmentSupportRatio(segment, evidence) >= 0.65);
}

const averageLength = index.reduce((sum, document) => sum + document.length, 0) / Math.max(index.length, 1);
const documentFrequency = new Map<string, number>();

for (const document of index) {
  for (const token of document.terms.keys()) {
    documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
}

function inverseDocumentFrequency(token: string) {
  const frequency = documentFrequency.get(token) ?? 0;
  return Math.log(1 + (index.length - frequency + 0.5) / (frequency + 0.5));
}

function buildQueryFeatures(query: string, skillToolsOverviewIntent = false) {
  const featureMap = new Map<string, number>();
  const addFeature = (token: string, weight: number) => {
    if (!documentFrequency.has(token)) return;
    featureMap.set(token, Math.max(featureMap.get(token) ?? 0, weight));
  };

  for (const token of phraseTokens(query)) addFeature(token, 3);
  for (const token of basicTokens(query)) {
    if (token.startsWith("w:")) addFeature(token, 2.5);
    else if (token.startsWith("g3:")) addFeature(token, 1);
    else addFeature(token, 0.35);
  }
  if (skillToolsOverviewIntent) {
    addFeature(`p:${compactText(SKILL_TOOLS_OVERVIEW_TITLE)}`, 4);
  }

  return Array.from(featureMap, ([token, weight]) => ({ token, weight } satisfies QueryFeature));
}

function hasUnknownLatinTerm(query: string) {
  for (const match of query.matchAll(/[a-z][a-z0-9+#._-]*/g)) {
    const word = match[0].replace(/^_+|_+$/g, "");
    if (word.length < 2 || ENGLISH_STOP_WORDS.has(word)) continue;
    if (!documentFrequency.has(`w:${word}`)) return true;
  }

  return false;
}

function vectorMagnitude(vector: EmbeddingVector) {
  let squaredMagnitude = 0;
  for (const value of vector) squaredMagnitude += value * value;
  return Math.sqrt(squaredMagnitude);
}

function isValidEmbedding(vector: EmbeddingVector | undefined, dimensions: number) {
  if (!vector || vector.length !== dimensions) return false;
  if (vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) return false;
  return vectorMagnitude(vector) > Number.EPSILON;
}

function cosineSimilarity(left: EmbeddingVector, right: EmbeddingVector) {
  let dotProduct = 0;
  let leftSquaredMagnitude = 0;
  let rightSquaredMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftSquaredMagnitude += leftValue * leftValue;
    rightSquaredMagnitude += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftSquaredMagnitude) * Math.sqrt(rightSquaredMagnitude);
  if (denominator <= Number.EPSILON) return 0;
  return Math.max(-1, Math.min(1, dotProduct / denominator));
}

function buildSemanticRanking(semantic: SemanticRetrievalInput | undefined): SemanticHit[] | undefined {
  if (!semantic) return undefined;
  if (semantic.model !== SEMANTIC_EMBEDDING_MODEL) return undefined;
  if (semantic.knowledgeVersion !== knowledgeDocument.version) return undefined;
  if (semantic.dimensions !== SEMANTIC_EMBEDDING_DIMENSIONS) return undefined;
  if (!isValidEmbedding(semantic.queryEmbedding, semantic.dimensions)) return undefined;

  const documentVectors = new Map<string, EmbeddingVector>();
  for (const entry of publicEntries) {
    const vector = semantic.documentEmbeddings[entry.id];
    if (!isValidEmbedding(vector, semantic.dimensions)) return undefined;
    documentVectors.set(entry.id, vector);
  }

  return publicEntries
    .map((entry) => ({
      entry,
      similarity: cosineSimilarity(semantic.queryEmbedding, documentVectors.get(entry.id) ?? [])
    }))
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.entry.id.localeCompare(right.entry.id, "zh-CN")
    );
}

function buildTopicSemanticInput(semantic: SemanticRetrievalInput | undefined): TopicSemanticInput | undefined {
  if (!semantic?.topicEmbeddings) return undefined;
  if (!isValidEmbedding(semantic.queryEmbedding, SEMANTIC_EMBEDDING_DIMENSIONS)) return undefined;
  for (const topic of publicTopics) {
    if (!isValidEmbedding(semantic.topicEmbeddings[topic.id], SEMANTIC_EMBEDDING_DIMENSIONS)) return undefined;
  }
  return {
    queryEmbedding: semantic.queryEmbedding,
    topicEmbeddings: semantic.topicEmbeddings
  };
}

function normalizeChildLexicalScore(score: number | undefined, topScore: number | undefined) {
  if (!Number.isFinite(score) || !Number.isFinite(topScore) || (topScore ?? 0) <= 0) return 0;
  return Math.max(0, Math.min(1, (score ?? 0) / (topScore ?? 1)));
}

function resolveRetrievalOptions(limitOrOptions: number | RetrievalOptions) {
  if (typeof limitOrOptions === "number") {
    return { limit: limitOrOptions, semantic: undefined };
  }

  return {
    limit: limitOrOptions.limit ?? 6,
    semantic: limitOrOptions.semantic
  };
}

function scoreDocument(document: IndexedEntry, features: QueryFeature[], compactQuery: string) {
  let score = 0;
  let matchedWeight = 0;
  let totalWeight = 0;
  let strongMatches = 0;
  let gramMatches = 0;
  let phraseMatches = 0;

  for (const feature of features) {
    const idf = inverseDocumentFrequency(feature.token);
    const queryWeight = feature.weight * Math.max(idf, 0.05);
    totalWeight += queryWeight;

    const termFrequency = document.terms.get(feature.token) ?? 0;
    if (!termFrequency) continue;

    matchedWeight += queryWeight;
    if (feature.token.startsWith("p:") || feature.token.startsWith("w:")) strongMatches += 1;
    if (feature.token.startsWith("p:")) phraseMatches += 1;
    if (feature.token.startsWith("g3:")) gramMatches += 1;

    const lengthNormalization = 1 - B + B * (document.length / Math.max(averageLength, 1));
    const saturation = (termFrequency * (K1 + 1)) / (termFrequency + K1 * lengthNormalization);
    score += idf * saturation * feature.weight;
  }

  if (document.normalizedTitle && compactQuery.includes(document.normalizedTitle)) score += 2;
  if (document.normalizedTags.some((tag) => tag && compactQuery.includes(tag))) score += 1;
  if (document.normalizedAliases.some((alias) => alias && compactQuery.includes(alias))) score += 1.4;

  return {
    coverage: totalWeight > 0 ? matchedWeight / totalWeight : 0,
    gramMatches,
    phraseMatches,
    score,
    strongMatches
  };
}

function isCredibleLexicalHit(hit: RetrievalHit, topScore: number) {
  const cutoff = Math.max(MIN_SCORE * 0.55, topScore * 0.42);
  return hit.score >= cutoff && (hit.strongMatches > 0 || hit.gramMatches >= 2);
}

function buildSemanticOnlyHits(semanticRanking: SemanticHit[], limit: number) {
  const topSimilarity = semanticRanking[0]?.similarity ?? 0;

  return semanticRanking
    .filter(
      (hit) =>
        hit.similarity >= MIN_SEMANTIC_SIMILARITY &&
        topSimilarity - hit.similarity <= MAX_SEMANTIC_HIT_GAP
    )
    .slice(0, limit)
    .map(
      (hit) =>
        ({
          coverage: round(Math.max(0, hit.similarity)),
          entry: hit.entry,
          gramMatches: 0,
          phraseMatches: 0,
          score: round(Math.max(0, hit.similarity) * 100),
          semanticSimilarity: round(hit.similarity),
          strongMatches: 0
        }) satisfies RetrievalHit
    );
}

function buildHybridHits(lexicalRanking: RetrievalHit[], semanticRanking: SemanticHit[], limit: number) {
  const candidates = new Map<string, HybridCandidate>();
  const credibleLexicalRanking = lexicalRanking.filter((hit) =>
    isCredibleLexicalHit(hit, lexicalRanking[0]?.score ?? 0)
  );

  credibleLexicalRanking.forEach((hit, index) => {
    candidates.set(hit.entry.id, {
      entry: hit.entry,
      lexical: hit,
      rrfScore: LEXICAL_RRF_WEIGHT / (RRF_K + index + 1)
    });
  });

  semanticRanking.forEach((hit, index) => {
    const candidate = candidates.get(hit.entry.id) ?? {
      entry: hit.entry,
      rrfScore: 0
    };
    candidate.semantic = hit;
    candidate.rrfScore += SEMANTIC_RRF_WEIGHT / (RRF_K + index + 1);
    candidates.set(hit.entry.id, candidate);
  });

  const maximumRrfScore = (LEXICAL_RRF_WEIGHT + SEMANTIC_RRF_WEIGHT) / (RRF_K + 1);
  const topSemanticSimilarity = semanticRanking[0]?.similarity ?? 0;

  return Array.from(candidates.values())
    .filter((candidate) => {
      const lexicalIsCredible = Boolean(candidate.lexical);
      const semanticSimilarity = candidate.semantic?.similarity ?? -1;
      const semanticIsCredible =
        semanticSimilarity >= MIN_SEMANTIC_SIMILARITY &&
        topSemanticSimilarity - semanticSimilarity <= MAX_SEMANTIC_HIT_GAP;
      return lexicalIsCredible || semanticIsCredible;
    })
    .sort(
      (left, right) =>
        right.rrfScore - left.rrfScore ||
        (right.semantic?.similarity ?? -1) - (left.semantic?.similarity ?? -1) ||
        (right.lexical?.score ?? 0) - (left.lexical?.score ?? 0) ||
        left.entry.id.localeCompare(right.entry.id, "zh-CN")
    )
    .slice(0, limit)
    .map((candidate) => {
      const lexical = candidate.lexical;
      const semanticSimilarity = candidate.semantic?.similarity;
      return {
        coverage: lexical?.coverage ?? round(Math.max(0, semanticSimilarity ?? 0)),
        entry: candidate.entry,
        gramMatches: lexical?.gramMatches ?? 0,
        phraseMatches: lexical?.phraseMatches ?? 0,
        score: round((candidate.rrfScore / maximumRrfScore) * 100),
        semanticSimilarity:
          semanticSimilarity === undefined ? undefined : round(semanticSimilarity),
        strongMatches: lexical?.strongMatches ?? 0
      } satisfies RetrievalHit;
    });
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function scopedTopicForHits(hits: RetrievalHit[]): RetrievalTopicResult | undefined {
  const first = hits[0]?.entry;
  if (!first) return undefined;
  const preferredId = first.category === "work-project"
    ? "work-experience"
    : first.category === "personal-project"
      ? "personal-projects"
      : first.id === "skill-ai-workflow"
        ? "ai-workflow"
        : first.category === "skill"
          ? "testing-skills"
          : undefined;
  const topic =
    publicTopics.find((candidate) => candidate.id === preferredId && candidate.entryIds.includes(first.id)) ??
    publicTopics.find((candidate) => candidate.entryIds.includes(first.id));
  if (!topic) return undefined;
  const evidenceCount = new Set(hits.filter((hit) => topic.entryIds.includes(hit.entry.id)).map((hit) => hit.entry.id)).size;
  return {
    evidenceCount,
    id: topic.id,
    mode: "scoped",
    score: round(Math.min(1, evidenceCount / 3)),
    title: topic.title
  };
}

export function retrieveKnowledge(
  query: string,
  limitOrOptions: number | RetrievalOptions = 6
): RetrievalResult {
  const options = resolveRetrievalOptions(limitOrOptions);
  const limit = Math.max(1, Math.min(options.limit, 6));
  const normalizedQuery = normalizeText(query).slice(0, 1_200);
  const compactQuery = compactText(normalizedQuery);
  const skillToolsOverviewIntent =
    isSkillToolsOverviewQuery(normalizedQuery) && !hasSpecificProjectAnchor(normalizedQuery);
  const features = buildQueryFeatures(normalizedQuery, skillToolsOverviewIntent);
  const semanticRanking = buildSemanticRanking(options.semantic)?.filter(
    (hit) => skillToolsOverviewIntent || hit.entry.id !== SKILL_TOOLS_OVERVIEW_ENTRY_ID
  );

  if (!compactQuery || (features.length === 0 && !semanticRanking)) {
    return { accepted: false, coverage: 0, hits: [], query: normalizedQuery, reason: "no-meaningful-query" };
  }

  const ranked = index
    .map((document) => {
      const metrics = scoreDocument(document, features, compactQuery);
      return {
        coverage: metrics.coverage,
        entry: document.entry,
        gramMatches: metrics.gramMatches,
        phraseMatches: metrics.phraseMatches,
        score: metrics.score,
        strongMatches: metrics.strongMatches
      } satisfies RetrievalHit;
    })
    .filter((hit) => skillToolsOverviewIntent || hit.entry.id !== SKILL_TOOLS_OVERVIEW_ENTRY_ID)
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.entry.id.localeCompare(right.entry.id));

  const top = ranked[0];
  if (!top && !semanticRanking) {
    return { accepted: false, coverage: 0, hits: [], query: normalizedQuery, reason: "insufficient-evidence" };
  }

  const hasStrongEvidence = Boolean(
    top && top.strongMatches >= 1 && top.coverage >= MIN_STRONG_COVERAGE
  );
  const hasExactPhraseEvidence = Boolean(
    top && top.phraseMatches >= 1 && top.coverage >= MIN_EXACT_PHRASE_COVERAGE
  );
  const hasGramEvidence = Boolean(
    top && top.strongMatches === 0 && top.gramMatches >= 2 && top.coverage >= MIN_GRAM_COVERAGE
  );
  const hasExperienceIntent =
    skillToolsOverviewIntent || EXPERIENCE_INTENT_PATTERNS.some((pattern) => pattern.test(normalizedQuery));
  const hasExplicitTopic = features.some((feature) => feature.token.startsWith("p:"));
  const hasKeywordCombination = (top?.strongMatches ?? 0) >= 2;
  const isGenericInformationRequest =
    GENERIC_INFORMATION_PATTERNS.some((pattern) => pattern.test(normalizedQuery)) ||
    UNSUPPORTED_ENVIRONMENT_PATTERN.test(normalizedQuery) ||
    looksLikeGeneralAdvice(normalizedQuery, hasKeywordCombination);
  const broadTopicOverviewIntent =
    skillToolsOverviewIntent || isBroadTopicOverviewQuery(normalizedQuery);
  const queryPassesSafetyGate =
    (!isGenericInformationRequest || broadTopicOverviewIntent) && !hasUnknownLatinTerm(normalizedQuery);
  const lexicalCandidatePassesSafetyGate =
    queryPassesSafetyGate && (!top || entrySupportsRequestedClaim(normalizedQuery, top.entry));
  const lexicalAccepted =
    Boolean(top) &&
    (top?.score ?? 0) >= MIN_SCORE &&
    lexicalCandidatePassesSafetyGate &&
    (hasExperienceIntent || hasExplicitTopic || hasKeywordCombination) &&
    (hasStrongEvidence || hasExactPhraseEvidence || hasGramEvidence);

  const semanticTop = semanticRanking?.[0];
  const semanticSecond = semanticRanking?.[1];
  const semanticMargin = semanticTop
    ? semanticTop.similarity - (semanticSecond?.similarity ?? -1)
    : 0;
  const semanticConfident = Boolean(
    semanticTop &&
      semanticTop.similarity >= MIN_SEMANTIC_SIMILARITY &&
      semanticMargin >= MIN_SEMANTIC_MARGIN
  );
  const hasSemanticScopeSignal =
    hasExperienceIntent || hasExplicitTopic || hasKeywordCombination || hasSpecificProjectAnchor(normalizedQuery);
  // 真实正反例评估显示 cosine 区间重叠，因此只有通过教程/未知能力/同条证据校验的
  // 个人经历或明确项目问题，才允许向量补足口语表达，而不能仅凭“相似”扩大能力边界。
  const semanticAccepted = Boolean(
    semanticTop &&
      queryPassesSafetyGate &&
      hasSemanticScopeSignal &&
      semanticTop.similarity >= MIN_VECTOR_ONLY_SIMILARITY &&
      semanticMargin >= MIN_VECTOR_ONLY_MARGIN &&
      entrySupportsRequestedClaim(normalizedQuery, semanticTop.entry)
  );
  const requestedClaim = extractRequestedClaim(normalizedQuery);
  const hasSpecificClaim = Boolean(
    requestedClaim &&
      !broadTopicOverviewIntent &&
      !isBroadGenericClaim(requestedClaim)
  );
  const topicAggregationAllowed =
    queryPassesSafetyGate &&
    !hasSpecificClaim &&
    !hasSpecificProjectAnchor(normalizedQuery) &&
    broadTopicOverviewIntent;

  if (topicAggregationAllowed) {
    const evidenceSignals = publicEntries.map((entry) => ({
      entryId: entry.id,
      lexical: normalizeChildLexicalScore(
        ranked.find((hit) => hit.entry.id === entry.id)?.score,
        top?.score
      ),
      semantic: semanticRanking?.find((hit) => hit.entry.id === entry.id)?.similarity,
      valid: entrySupportsRequestedClaim(normalizedQuery, entry)
    }));
    const topicMatch = rankKnowledgeTopics({
      evidence: evidenceSignals,
      query: normalizedQuery,
      semantic: buildTopicSemanticInput(options.semantic),
      topics: publicTopics
    }).find((match) => match.accepted);

    if (topicMatch) {
      const topicEntryIds = new Set(topicMatch.topic.entryIds);
      const merged = semanticRanking
        ? buildHybridHits(ranked, semanticRanking, publicEntries.length)
        : ranked.map((hit) => ({ ...hit, coverage: round(hit.coverage), score: round(hit.score) }));
      const mergedById = new Map(merged.map((hit) => [hit.entry.id, hit]));
      const topicEntriesById = new Map(
        publicEntries
          .filter((entry) => topicEntryIds.has(entry.id))
          .map((entry) => [entry.id, entry])
      );
      const orderedTopicEntryIds = [
        ...(topicMatch.topic.overviewEntryId ? [topicMatch.topic.overviewEntryId] : []),
        ...topicMatch.topic.entryIds,
        ...merged.filter((hit) => topicEntryIds.has(hit.entry.id)).map((hit) => hit.entry.id)
      ];

      // Once the topic itself passes the broad-query gate, include its configured child evidence.
      // This lets the answer layer summarize several public facts instead of copying one top chunk.
      const topicHits = [...new Set(orderedTopicEntryIds)]
        .flatMap((entryId) => {
          const existingHit = mergedById.get(entryId);
          if (existingHit) return [existingHit];
          const entry = topicEntriesById.get(entryId);
          return entry
            ? [{ coverage: 0, entry, gramMatches: 0, phraseMatches: 0, score: 0, strongMatches: 0 }]
            : [];
        })
        .filter((hit) => entrySupportsRequestedClaim(normalizedQuery, hit.entry))
        .slice(0, limit);

      if (topicHits.length > 0) {
        return {
          accepted: true,
          coverage: round(topicMatch.score),
          hits: topicHits,
          query: normalizedQuery,
          reason: "accepted",
          topic: {
            evidenceCount: topicMatch.evidenceCount,
            id: topicMatch.topic.id,
            mode: "overview",
            score: topicMatch.score,
            title: topicMatch.topic.title
          }
        };
      }
    }
  }
  const accepted = lexicalAccepted || semanticAccepted;

  if (!accepted) {
    return {
      accepted: false,
      coverage: round(top?.coverage ?? Math.max(0, semanticTop?.similarity ?? 0)),
      hits: [],
      query: normalizedQuery,
      reason: "insufficient-evidence"
    };
  }

  let hits: RetrievalHit[];
  if (lexicalAccepted && semanticRanking && semanticConfident) {
    hits = buildHybridHits(ranked, semanticRanking, limit);
  } else if (lexicalAccepted) {
    const cutoff = Math.max(MIN_SCORE * 0.55, (top?.score ?? 0) * 0.42);
    hits = ranked
      .filter((hit) => hit.score >= cutoff && (hit.strongMatches > 0 || hit.gramMatches >= 2))
      .slice(0, limit)
      .map((hit) => ({ ...hit, coverage: round(hit.coverage), score: round(hit.score) }));
  } else {
    hits = buildSemanticOnlyHits(semanticRanking ?? [], limit);
  }

  hits = hits.filter((hit) => entrySupportsRequestedClaim(normalizedQuery, hit.entry));

  if (hits.length === 0) {
    return {
      accepted: false,
      coverage: round(top?.coverage ?? Math.max(0, semanticTop?.similarity ?? 0)),
      hits: [],
      query: normalizedQuery,
      reason: "insufficient-evidence"
    };
  }

  const first = hits[0];
  const second = hits[1];
  const ambiguous =
    /这个项目|那个项目|这次|那次|它/.test(normalizedQuery) &&
    Boolean(second) &&
    second.entry.category.includes("project") &&
    first.entry.category.includes("project") &&
    second.score / Math.max(first.score, Number.EPSILON) > 0.86;

  return {
    accepted: !ambiguous,
    coverage: round(first.coverage),
    hits: ambiguous ? [] : hits,
    query: normalizedQuery,
    reason: ambiguous ? "ambiguous" : "accepted",
    ...(ambiguous ? {} : { topic: scopedTopicForHits(hits) })
  };
}

export function getKnowledgeMetadata() {
  return {
    entryCount: publicEntries.length,
    topicCount: knowledgeDocument.topics.length,
    updatedAt: knowledgeDocument.updatedAt,
    version: knowledgeDocument.version
  };
}
