export type KnowledgeSource = {
  period?: string;
  title: string;
};

export type KnowledgeChatTurn = {
  content: string;
  role: "assistant" | "user";
};

export type KnowledgeChatResponse = {
  answer: string;
  sources: KnowledgeSource[];
  suggestions: string[];
};

const knowledgeApiBase = (import.meta.env.VITE_KNOWLEDGE_API_BASE ?? "").replace(/\/$/, "");

export const knowledgeApiEnabled = import.meta.env.VITE_KNOWLEDGE_API_ENABLED === "true";

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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

  return { answer, sources, suggestions };
}

export async function askKnowledgeBase(
  question: string,
  conversation: KnowledgeChatTurn[],
  signal?: AbortSignal
) {
  const response = await fetch(`${knowledgeApiBase}/api/ask`, {
    body: JSON.stringify({
      conversation: conversation.slice(-6),
      question
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("提问有些频繁，请稍后再试");
    throw new Error("知识库服务暂时不可用");
  }

  return parseResponse(await response.json());
}
