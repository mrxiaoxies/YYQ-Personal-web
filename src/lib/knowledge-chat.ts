export type KnowledgeSource = {
  period?: string;
  title: string;
};

export type KnowledgeChatTurn = {
  content: string;
  role: "assistant" | "user";
};

export type KnowledgeRetrievalDecision =
  | "answered"
  | "blocked-before-retrieval"
  | "clarification-required"
  | "insufficient-evidence";

export type KnowledgeRetrievalMode =
  | "hybrid"
  | "lexical"
  | "lexical-fallback"
  | "not-run";

export type KnowledgeRetrievalFallbackReason =
  | "circuit-open"
  | "embedding-timeout"
  | "embedding-unavailable"
  | "index-mismatch"
  | "invalid-vector";

export type KnowledgeRetrievalStageName =
  | "embedding"
  | "fallback"
  | "fusion"
  | "grounding"
  | "lexical"
  | "policy"
  | "semantic";

export type KnowledgeRetrievalStageStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "passed"
  | "skipped";

export type KnowledgeRetrievalTrace = {
  candidates: Array<{
    scores: {
      fused?: number;
      lexical?: number;
      semantic?: number;
    };
    selected: boolean;
    title: string;
  }>;
  decision: KnowledgeRetrievalDecision;
  dimensions?: number;
  fallbackReason?: KnowledgeRetrievalFallbackReason;
  mode: KnowledgeRetrievalMode;
  model?: string;
  schemaVersion: 2;
  stages: Array<{
    durationMs?: number;
    name: KnowledgeRetrievalStageName;
    status: KnowledgeRetrievalStageStatus;
  }>;
  timings: {
    retrievalMs?: number;
    totalMs: number;
  };
  factDerivationTypes?: Array<"compare" | "count" | "duration" | "group" | "link" | "summarize">;
  topicEvidenceCount?: number;
  topicTitle?: string;
};

export type KnowledgeChatResponse = {
  answer: string;
  retrievalTrace?: KnowledgeRetrievalTrace;
  sources: KnowledgeSource[];
  suggestions: string[];
};

export type KnowledgeServiceStatus = "checking" | "preview" | "ready" | "unavailable";

const configuredKnowledgeApiBase = (import.meta.env.VITE_KNOWLEDGE_API_BASE ?? "")
  .trim()
  .replace(/\/+$/, "");
const githubPagesApiBase =
  typeof window !== "undefined" && window.location.hostname.endsWith(".github.io")
    ? "https://yyq-web.netlify.app"
    : "";
const knowledgeApiBase = configuredKnowledgeApiBase || githubPagesApiBase;

export const knowledgeApiEnabled =
  import.meta.env.VITE_KNOWLEDGE_API_ENABLED !== "false";

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

const retrievalDecisions = new Set<KnowledgeRetrievalDecision>([
  "answered",
  "blocked-before-retrieval",
  "clarification-required",
  "insufficient-evidence"
]);
const retrievalModes = new Set<KnowledgeRetrievalMode>([
  "hybrid",
  "lexical",
  "lexical-fallback",
  "not-run"
]);
const retrievalFallbackReasons = new Set<KnowledgeRetrievalFallbackReason>([
  "circuit-open",
  "embedding-timeout",
  "embedding-unavailable",
  "index-mismatch",
  "invalid-vector"
]);
const retrievalStageNames = new Set<KnowledgeRetrievalStageName>([
  "embedding",
  "fallback",
  "fusion",
  "grounding",
  "lexical",
  "policy",
  "semantic"
]);
const retrievalStageStatuses = new Set<KnowledgeRetrievalStageStatus>([
  "blocked",
  "completed",
  "failed",
  "passed",
  "skipped"
]);

function parseRetrievalTrace(value: unknown): KnowledgeRetrievalTrace | undefined {
  if (!isRecord(value) || value.schemaVersion !== 2) return undefined;
  if (!retrievalDecisions.has(value.decision as KnowledgeRetrievalDecision)) return undefined;
  if (!retrievalModes.has(value.mode as KnowledgeRetrievalMode)) return undefined;
  if (!Array.isArray(value.stages) || !Array.isArray(value.candidates) || !isRecord(value.timings)) {
    return undefined;
  }

  const totalMs = boundedNumber(value.timings.totalMs, 0, 300_000);
  if (totalMs === undefined) return undefined;

  const seenStages = new Set<KnowledgeRetrievalStageName>();
  const stages = value.stages
    .slice(0, 8)
    .map((stage) => {
      if (!isRecord(stage)) return null;
      const name = stage.name as KnowledgeRetrievalStageName;
      const status = stage.status as KnowledgeRetrievalStageStatus;
      if (
        !retrievalStageNames.has(name) ||
        !retrievalStageStatuses.has(status) ||
        seenStages.has(name)
      ) {
        return null;
      }
      seenStages.add(name);

      const durationMs = boundedNumber(stage.durationMs, 0, 300_000);
      return durationMs === undefined ? { name, status } : { durationMs, name, status };
    })
    .filter((stage): stage is KnowledgeRetrievalTrace["stages"][number] => stage !== null);

  const seenCandidates = new Set<string>();
  const candidates = value.candidates
    .slice(0, 3)
    .map((candidate) => {
      if (!isRecord(candidate) || typeof candidate.selected !== "boolean" || !isRecord(candidate.scores)) {
        return null;
      }

      const title = cleanString(candidate.title, 120);
      const normalizedTitle = title.toLocaleLowerCase();
      if (!title || seenCandidates.has(normalizedTitle)) return null;

      const lexical = boundedNumber(candidate.scores.lexical, 0, 1);
      const semantic = boundedNumber(candidate.scores.semantic, 0, 1);
      const fused = boundedNumber(candidate.scores.fused, 0, 1);
      if (lexical === undefined && semantic === undefined && fused === undefined) return null;
      seenCandidates.add(normalizedTitle);

      return {
        scores: {
          ...(lexical === undefined ? {} : { lexical }),
          ...(semantic === undefined ? {} : { semantic }),
          ...(fused === undefined ? {} : { fused })
        },
        selected: candidate.selected,
        title
      };
    })
    .filter((candidate): candidate is KnowledgeRetrievalTrace["candidates"][number] => candidate !== null);

  const rawModel = cleanString(value.model, 80);
  const model =
    /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,79}$/.test(rawModel) && !rawModel.includes("..")
      ? rawModel
      : "";
  const dimensions = boundedNumber(value.dimensions, 1, 8_192);
  const fallbackReason = retrievalFallbackReasons.has(
    value.fallbackReason as KnowledgeRetrievalFallbackReason
  )
    ? (value.fallbackReason as KnowledgeRetrievalFallbackReason)
    : undefined;
  const retrievalMs = boundedNumber(value.timings.retrievalMs, 0, 300_000);
  const topicTitle = cleanString(value.topicTitle, 120);
  const topicEvidenceCount = boundedNumber(value.topicEvidenceCount, 1, 6);
  const allowedFactTypes = new Set(["compare", "count", "duration", "group", "link", "summarize"]);
  const factDerivationTypes = Array.isArray(value.factDerivationTypes)
    ? [...new Set(value.factDerivationTypes)]
        .filter((item): item is NonNullable<KnowledgeRetrievalTrace["factDerivationTypes"]>[number] =>
          typeof item === "string" && allowedFactTypes.has(item)
        )
        .slice(0, 6)
    : [];

  return {
    candidates,
    decision: value.decision as KnowledgeRetrievalDecision,
    ...(dimensions !== undefined && Number.isInteger(dimensions) ? { dimensions } : {}),
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
    mode: value.mode as KnowledgeRetrievalMode,
    ...(model ? { model } : {}),
    schemaVersion: 2,
    stages,
    timings: {
      ...(retrievalMs === undefined ? {} : { retrievalMs }),
      totalMs
    },
    ...(topicTitle ? { topicTitle } : {}),
    ...(topicEvidenceCount !== undefined && Number.isInteger(topicEvidenceCount)
      ? { topicEvidenceCount }
      : {}),
    ...(factDerivationTypes.length > 0 ? { factDerivationTypes } : {})
  };
}

async function requestError(response: Response) {
  let code = "";
  let requestId = "";

  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const error = payload.error;
    if (error && typeof error === "object") {
      code = cleanString((error as Record<string, unknown>).code, 80);
    }
    requestId = cleanString(payload.requestId, 120);
  } catch {
    // The status code still provides a safe fallback when the body is unavailable.
  }

  const messages: Record<string, string> = {
    cors_forbidden: "当前网站来源未获知识库授权",
    invalid_request: "问题格式不正确，请调整后再试",
    model_timeout: "回答生成超时，请稍后重试",
    model_unavailable: "回答模型暂时不可用，请稍后重试"
  };
  const fallback =
    response.status === 429
      ? "提问有些频繁，请稍后再试"
      : response.status === 400
        ? "问题格式不正确，请调整后再试"
        : response.status === 403
          ? "当前网站来源未获知识库授权"
          : "知识库服务暂时不可用";
  const message = messages[code] ?? fallback;

  return new Error(requestId ? `${message}（请求编号：${requestId}）` : message);
}

function parseResponse(value: unknown): KnowledgeChatResponse {
  if (!value || typeof value !== "object") throw new Error("知识库返回了无效数据");

  const payload = value as Record<string, unknown>;
  const answer = cleanString(payload.answer, 6_000);
  if (!answer) throw new Error("知识库没有返回回答");

  const sources = Array.isArray(payload.sources)
    ? payload.sources
        .map((source) => {
          if (!source || typeof source !== "object") return null;
          const item = source as Record<string, unknown>;
          const title = cleanString(item.title, 120);
          if (!title) return null;

          const period = cleanString(item.period, 60);
          const normalized: KnowledgeSource = { title };
          if (period) normalized.period = period;

          return normalized;
        })
        .filter((source): source is KnowledgeSource => source !== null)
        .slice(0, 6)
    : [];

  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions
        .map((suggestion) => cleanString(suggestion, 160))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const retrievalTrace = parseRetrievalTrace(payload.retrievalTrace);
  return { answer, ...(retrievalTrace ? { retrievalTrace } : {}), sources, suggestions };
}

export async function checkKnowledgeHealth(signal?: AbortSignal): Promise<KnowledgeServiceStatus> {
  if (!knowledgeApiEnabled) return "preview";

  try {
    const response = await fetch(`${knowledgeApiBase}/api/health`, {
      headers: { Accept: "application/json" },
      method: "GET",
      signal
    });
    if (!response.ok) return "unavailable";

    const payload = (await response.json()) as Record<string, unknown>;
    return payload.status === "ready" ? "ready" : "unavailable";
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") throw reason;
    return "unavailable";
  }
}

export async function askKnowledgeBase(
  question: string,
  conversation: KnowledgeChatTurn[],
  signal?: AbortSignal
) {
  const safeConversation = conversation
    .filter((turn) => turn.role === "user")
    .map((turn) => ({ content: cleanString(turn.content, 1_000), role: "user" as const }))
    .filter((turn) => turn.content)
    .slice(-6);

  let response: Response;
  try {
    response = await fetch(`${knowledgeApiBase}/api/ask`, {
      body: JSON.stringify({
        conversation: safeConversation,
        question
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal
    });
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") throw reason;
    throw new Error("暂时无法连接知识库服务，请稍后再试");
  }

  if (!response.ok) {
    throw await requestError(response);
  }

  try {
    return parseResponse(await response.json());
  } catch {
    throw new Error("知识库返回了无效数据，请稍后再试");
  }
}
