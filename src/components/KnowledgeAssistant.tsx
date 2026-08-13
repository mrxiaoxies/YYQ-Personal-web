import {
  ArrowUpRight,
  BookOpenText,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Code2,
  CornerDownLeft,
  MessageCircleMore,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  askKnowledgeBase,
  checkKnowledgeHealth,
  knowledgeApiEnabled,
  type KnowledgeChatTurn,
  type KnowledgeRetrievalDecision,
  type KnowledgeRetrievalFallbackReason,
  type KnowledgeRetrievalMode,
  type KnowledgeRetrievalStageName,
  type KnowledgeRetrievalStageStatus,
  type KnowledgeRetrievalTrace,
  type KnowledgeServiceStatus,
  type KnowledgeSource
} from "@/lib/knowledge-chat";
import {
  buildRetrievalSummaryBadges,
  shouldShowRetrievalFallback
} from "@/lib/retrieval-trace-display";

type ChatMessage = {
  content: string;
  id: string;
  retrievalTrace?: KnowledgeRetrievalTrace;
  role: "assistant" | "user";
  sources?: KnowledgeSource[];
  suggestions?: string[];
};

const questionLimit = 300;

const serviceLabels: Record<KnowledgeServiceStatus, string> = {
  checking: "正在检测知识库",
  preview: "本地预览模式",
  ready: "知识库已就绪",
  unavailable: "知识库暂不可用"
};

const retrievalModeLabels: Record<KnowledgeRetrievalMode, string> = {
  hybrid: "混合检索",
  lexical: "关键词检索",
  "lexical-fallback": "关键词降级",
  "not-run": "未进入检索"
};

const retrievalOverviewCopy: Record<KnowledgeRetrievalMode, string> = {
  hybrid: "公开知识在发布前由同一个本地模型离线生成向量；提问时再为当前问题生成向量，并和关键词结果合并。",
  lexical: "本次直接使用关键词匹配公开知识，没有执行问题向量化；下方状态显示实际经过的步骤。",
  "lexical-fallback": "系统先尝试本地向量检索，未完成时自动保留关键词结果，回答不会因向量能力异常而中断。",
  "not-run": "本次请求在问题向量化前停止，因此没有检索知识内容；下方仍展示标准流程与实际状态。"
};

const retrievalDecisionLabels: Record<KnowledgeRetrievalDecision, string> = {
  answered: "证据已用于回答",
  "blocked-before-retrieval": "安全检查已拦截",
  "clarification-required": "需要补充问题",
  "insufficient-evidence": "公开证据不足"
};

const retrievalStageStatusLabels: Record<KnowledgeRetrievalStageStatus, string> = {
  blocked: "已拦截",
  completed: "已完成",
  failed: "未完成",
  passed: "已通过",
  skipped: "已跳过"
};

type CoreRetrievalStageName = Exclude<KnowledgeRetrievalStageName, "fallback">;

const retrievalSteps: Array<{
  description: string;
  name: CoreRetrievalStageName;
  title: string;
}> = [
  {
    description: "确认问题属于可公开的个人经历范围；敏感、越界或诱导泄露的问题不会进入检索。",
    name: "policy",
    title: "安全与范围检查"
  },
  {
    description: "本地模型把自然语言问题编码为语义向量，让口语化表达也能按含义匹配。",
    name: "embedding",
    title: "问题向量化"
  },
  {
    description: "匹配项目名、工具名和技术术语，保留明确关键词带来的精确信号。",
    name: "lexical",
    title: "关键词检索"
  },
  {
    description: "比较问题向量与预先生成的知识向量，找出意思相近但措辞不同的经历。",
    name: "semantic",
    title: "向量语义检索"
  },
  {
    description: "合并关键词排名与语义排名，降低只依赖单一检索方式造成的偏差。",
    name: "fusion",
    title: "双路结果融合"
  },
  {
    description: "只把通过检查的公开候选交给回答模型；证据不足时会拒答或请你补充。",
    name: "grounding",
    title: "证据约束与回答"
  }
];

const vectorPipelines = [
  {
    cadence: "发布前",
    id: "knowledge",
    label: "知识侧",
    steps: ["公开知识", "分词", "本地 ONNX/WASM 推理", "Mean Pooling", "L2 归一化", "512 维索引"]
  },
  {
    cadence: "每次提问",
    id: "question",
    label: "问题侧",
    steps: ["自然问题", "口语归一/检索指令", "同一 BGE 模型", "512 维问题向量", "余弦相似度", "RRF 融合", "公开证据"]
  }
] as const;

const safeFallbackLabels: Record<KnowledgeRetrievalFallbackReason, string> = {
  "circuit-open": "本地向量能力正处于保护性暂停状态，已自动改用关键词检索。",
  "embedding-timeout": "本地问题向量化超时，已自动改用关键词检索。",
  "embedding-unavailable": "本地问题向量化暂不可用，已自动改用关键词检索。",
  "index-mismatch": "知识向量索引未通过一致性检查，已自动改用关键词检索。",
  "invalid-vector": "向量结果未通过完整性检查，已自动改用关键词检索。",
};

const starterQuestions = [
  {
    category: "工作经历",
    icon: BriefcaseBusiness,
    question: "你做过哪些环境系统测试？"
  },
  {
    category: "技术经验",
    icon: Code2,
    question: "你有哪些 Linux 环境搭建经验？"
  },
  {
    category: "AI 工作流",
    icon: Sparkles,
    question: "你怎样使用 AI 和 Codex 提升效率？"
  }
];

const welcomeMessage: ChatMessage = {
  content: "你好，我是 YYQ 的经历助手。你可以询问他的项目职责、技术经验，以及解决具体问题的方法。",
  id: "welcome",
  role: "assistant"
};

function createMessageId(role: ChatMessage["role"]) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${role}-${suffix}`;
}

function previewReply(question: string): ChatMessage {
  const topic = question.replace(/[？?。！!]+$/g, "").slice(0, 42);

  return {
    content: `当前构建未启用可用的知识库接口，因此不会生成“${topic}”的经历回答。配置 /api/ask 后，助手会检索经审核的公开资料并在回答下方标注来源。`,
    id: createMessageId("assistant"),
    role: "assistant"
  };
}

function waitForPreview(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 620);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function AssistantMark() {
  return (
    <span className="knowledge-avatar is-assistant" aria-hidden="true">
      <Bot size={16} strokeWidth={1.8} />
    </span>
  );
}

function formatTraceDuration(durationMs: number | undefined) {
  if (durationMs === undefined) return "";
  if (durationMs >= 1_000) return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 1 : 2)} 秒`;
  if (durationMs > 0 && durationMs < 1) return "<1 毫秒";
  return `${Math.round(durationMs)} 毫秒`;
}

function RetrievalTracePanel({ trace }: { trace: KnowledgeRetrievalTrace }) {
  const stageByName = new Map(trace.stages.map((stage) => [stage.name, stage]));
  const fallbackStage = stageByName.get("fallback");
  const fallbackWasUsed = shouldShowRetrievalFallback(trace);
  const fallbackDescription = trace.fallbackReason
    ? safeFallbackLabels[trace.fallbackReason] ?? "向量检索未完成，系统已安全降级为关键词检索。"
    : "向量检索未完成，系统已安全降级为关键词检索。";
  const summaryBadges = buildRetrievalSummaryBadges(trace);

  return (
    <details className="knowledge-retrieval-trace mt-2.5">
      <summary className="knowledge-retrieval-summary">
        <span className="knowledge-retrieval-summary-title">
          <BrainCircuit aria-hidden="true" size={14} strokeWidth={1.8} />
          查看检索过程
        </span>
        <span className="knowledge-retrieval-mode">{retrievalModeLabels[trace.mode]}</span>
        <ChevronDown aria-hidden="true" className="knowledge-retrieval-chevron" size={14} strokeWidth={1.8} />
      </summary>

      <div className="knowledge-retrieval-body">
        <div className="knowledge-retrieval-overview">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="knowledge-retrieval-eyebrow">Local embedding pipeline</p>
              <p className="mt-1 text-xs font-semibold text-white/90">{retrievalDecisionLabels[trace.decision]}</p>
            </div>
            <span className="knowledge-retrieval-total">共 {formatTraceDuration(trace.timings.totalMs)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-white/60">
            {retrievalOverviewCopy[trace.mode]}
          </p>
          <div className="knowledge-retrieval-meta mt-2.5">
            {trace.model ? <span>模型 {trace.model}</span> : null}
            {trace.dimensions ? <span>{trace.dimensions} 维</span> : null}
            <span>{retrievalModeLabels[trace.mode]}</span>
            {trace.timings.retrievalMs !== undefined ? (
              <span>检索 {formatTraceDuration(trace.timings.retrievalMs)}</span>
            ) : null}
            {summaryBadges.map((badge) => <span key={badge}>{badge}</span>)}
          </div>
        </div>

        <section className="knowledge-vector-pipelines" aria-label="本地向量模型的知识侧与问题侧处理管线">
          {vectorPipelines.map((pipeline) => (
            <div className="knowledge-vector-pipeline" data-pipeline={pipeline.id} key={pipeline.id}>
              <div className="knowledge-vector-pipeline-header">
                <p className="knowledge-vector-pipeline-title">{pipeline.label}</p>
                <span className="knowledge-vector-pipeline-cadence">{pipeline.cadence}</span>
              </div>
              <ol
                aria-label={`${pipeline.label}（${pipeline.cadence}）：${pipeline.steps.join("，然后")}`}
                className="knowledge-vector-pipeline-flow"
              >
                {pipeline.steps.map((step, index) => (
                  <li key={step}>
                    <span className="knowledge-vector-pipeline-node">{step}</span>
                    {index < pipeline.steps.length - 1 ? (
                      <span aria-hidden="true" className="knowledge-vector-pipeline-arrow">→</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        <ol className="knowledge-retrieval-steps" aria-label="检索流程的六个步骤">
          {retrievalSteps.map((step, index) => {
            const stage = stageByName.get(step.name);
            const status = stage ? retrievalStageStatusLabels[stage.status] : "未执行";
            const duration = formatTraceDuration(stage?.durationMs);

            return (
              <li className="knowledge-retrieval-step" data-status={stage?.status ?? "not-run"} key={step.name}>
                <span className="knowledge-retrieval-step-number" aria-hidden="true">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-xs font-semibold text-white/88">{step.title}</p>
                    <span className="knowledge-retrieval-step-status">
                      {status}{duration ? ` · ${duration}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-[1.15rem] text-white/52">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {fallbackWasUsed ? (
          <div className="knowledge-retrieval-fallback" data-status={fallbackStage?.status ?? "completed"}>
            <span className="knowledge-retrieval-fallback-label">自动降级</span>
            <p>{fallbackDescription}</p>
          </div>
        ) : null}

        {trace.candidates.length ? (
          <div className="knowledge-retrieval-candidates">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold text-white/72">候选证据</p>
              <span className="text-[10px] text-white/38">只显示公开标题与分数</span>
            </div>
            <div className="space-y-1.5">
              {trace.candidates.map((candidate) => (
                <div className="knowledge-retrieval-candidate" data-selected={candidate.selected} key={candidate.title}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/78" title={candidate.title}>
                      {candidate.title}
                    </span>
                    {candidate.selected ? <span className="knowledge-retrieval-selected">已采用</span> : null}
                  </div>
                  <div className="knowledge-retrieval-scores" aria-label={`${candidate.title} 的检索分数`}>
                    {candidate.scores.lexical !== undefined ? <span>关键词 {candidate.scores.lexical.toFixed(3)}</span> : null}
                    {candidate.scores.semantic !== undefined ? <span>语义 {candidate.scores.semantic.toFixed(3)}</span> : null}
                    {candidate.scores.fused !== undefined ? <span>融合 {candidate.scores.fused.toFixed(3)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="knowledge-retrieval-privacy">
          为保护资料与系统安全，这里不展示原始向量、判定阈值、提示词或知识正文。
        </p>
      </div>
    </details>
  );
}

export function KnowledgeAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState("");
  const [serviceStatus, setServiceStatus] = useState<KnowledgeServiceStatus>(
    knowledgeApiEnabled ? "checking" : "preview"
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const closeChat = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsAnswering(false);
    setIsOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  const openChat = useCallback((question?: string) => {
    setIsOpen(true);
    setError("");
    if (question) setInput(question);
  }, []);

  useEffect(() => {
    if (!knowledgeApiEnabled) {
      setServiceStatus("preview");
      return;
    }

    const controller = new AbortController();
    setServiceStatus("checking");
    void checkKnowledgeHealth(controller.signal)
      .then(setServiceStatus)
      .catch((reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setServiceStatus("unavailable");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 180);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeChat();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeChat, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ behavior: "smooth", top: scrollRef.current.scrollHeight });
  }, [isAnswering, isOpen, messages]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    []
  );

  const askQuestion = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.replace(/\s+/g, " ").trim().slice(0, questionLimit);
      if (!question || isAnswering) return;

      const userMessage: ChatMessage = {
        content: question,
        id: createMessageId("user"),
        role: "user"
      };
      const priorConversation: KnowledgeChatTurn[] = messages.map(({ content, role }) => ({ content, role }));

      setIsOpen(true);
      setInput("");
      setError("");
      setMessages((current) => [...current, userMessage]);
      setIsAnswering(true);

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        if (!knowledgeApiEnabled) {
          await waitForPreview(controller.signal);
          setMessages((current) => [...current, previewReply(question)]);
          return;
        }

        const response = await askKnowledgeBase(question, priorConversation, controller.signal);
        setMessages((current) => [
          ...current,
          {
            content: response.answer,
            id: createMessageId("assistant"),
            retrievalTrace: response.retrievalTrace,
            role: "assistant",
            sources: response.sources,
            suggestions: response.suggestions
          }
        ]);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "暂时无法获取回答，请稍后再试");
      } finally {
        if (requestRef.current === controller) {
          setIsAnswering(false);
          requestRef.current = null;
        }
      }
    },
    [isAnswering, messages]
  );

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void askQuestion(input);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void askQuestion(input);
    }
  };

  const resetConversation = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setMessages([welcomeMessage]);
    setInput("");
    setError("");
    setIsAnswering(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      <section className="knowledge-section order-2 relative z-10 px-6 py-28" id="ask">
        <div className="knowledge-showcase liquid-glass glass-panel light-reactive mx-auto grid max-w-6xl overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
          <div className="knowledge-showcase-copy p-7 sm:p-10 lg:p-12">
            <div className="knowledge-kicker">
              <Sparkles aria-hidden="true" size={15} strokeWidth={1.8} />
              <span>Personal Knowledge Assistant</span>
            </div>
            <h2 className="mt-7 max-w-2xl text-4xl font-normal tracking-[-0.8px] sm:text-6xl" style={{ fontFamily: "var(--font-cjk-display)" }}>
              不止读简历，<br />直接问我的经历。
            </h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-forest-muted-foreground sm:text-lg">
              围绕工作项目、测试方法、Linux 环境与 AI 工作流提问。回答将基于可公开资料生成，并附上经历来源。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                aria-controls="knowledge-chat-panel"
                className="knowledge-primary-action h-auto rounded-full px-6 py-3.5 text-sm text-white transition-transform hover:scale-[1.02]"
                onClick={() => openChat()}
                type="button"
              >
                开始提问
                <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />
              </Button>
              <span className="knowledge-preview-badge" data-state={serviceStatus}>
                <span className="knowledge-status-dot" />
                {serviceLabels[serviceStatus]}
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-forest-muted-foreground">
              <span className="inline-flex items-center gap-2"><ShieldCheck aria-hidden="true" size={15} />仅使用公开资料</span>
              <span className="inline-flex items-center gap-2"><BookOpenText aria-hidden="true" size={15} />回答附带来源</span>
            </div>
          </div>

          <div className="knowledge-question-stage p-5 sm:p-7 lg:p-9">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-forest-muted-foreground">Try asking</p>
                <p className="mt-2 text-sm text-foreground">从一个你关心的话题开始</p>
              </div>
              <span className="knowledge-mini-mark"><Bot aria-hidden="true" size={19} strokeWidth={1.7} /></span>
            </div>

            <div className="grid gap-3">
              {starterQuestions.map(({ category, icon: Icon, question }, index) => (
                <button
                  className="knowledge-question-card group"
                  key={question}
                  onClick={() => openChat(question)}
                  type="button"
                >
                  <span className="knowledge-question-icon"><Icon aria-hidden="true" size={18} strokeWidth={1.7} /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[11px] uppercase tracking-[0.18em] text-forest-muted-foreground">{category}</span>
                    <span className="mt-1.5 block text-sm leading-6 text-foreground sm:text-base">{question}</span>
                  </span>
                  <span className="text-sm text-forest-muted-foreground transition-transform group-hover:translate-x-1">0{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {typeof document !== "undefined"
        ? createPortal(
            <>
      {!isOpen ? (
        <button
          aria-controls="knowledge-chat-panel"
          aria-expanded="false"
          aria-label="打开 YYQ 经历助手"
          className="knowledge-launcher liquid-glass forest-control light-reactive fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full py-2.5 pl-3 pr-4 text-foreground sm:bottom-7 sm:right-7"
          onClick={() => openChat()}
          ref={launcherRef}
          type="button"
        >
          <span className="knowledge-launcher-icon"><MessageCircleMore aria-hidden="true" size={20} strokeWidth={1.8} /></span>
          <span className="text-left">
            <span className="block text-[10px] uppercase tracking-[0.2em] text-forest-muted-foreground">Ask YYQ</span>
            <span className="block text-sm font-semibold">问问我的经历</span>
          </span>
        </button>
      ) : null}

      {isOpen ? (
        <div className="knowledge-chat-layer fixed inset-0 z-50 flex items-end justify-end sm:p-5 md:p-7">
          <button aria-label="关闭经历助手" className="knowledge-chat-backdrop absolute inset-0" onClick={closeChat} type="button" />
          <div
            aria-describedby="knowledge-dialog-description"
            aria-labelledby="knowledge-dialog-title"
            aria-modal="true"
            className="knowledge-chat-panel liquid-glass light-reactive relative z-10 flex w-full flex-col overflow-hidden sm:rounded-[30px]"
            id="knowledge-chat-panel"
            ref={panelRef}
            role="dialog"
          >
            <header className="knowledge-chat-header flex items-center gap-3 px-4 py-4 sm:px-5">
              <span className="knowledge-chat-brand"><Bot aria-hidden="true" size={20} strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold" id="knowledge-dialog-title">YYQ 经历助手</h2>
                  <span className="knowledge-header-state" data-state={serviceStatus}>
                    {serviceStatus === "ready" ? <Check aria-hidden="true" size={10} strokeWidth={2.4} /> : <span aria-hidden="true">•</span>}
                    {serviceLabels[serviceStatus]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-forest-muted-foreground" id="knowledge-dialog-description">
                  工作经历 · 技术经验 · 项目方法
                </p>
              </div>
              <button aria-label="重新开始对话" className="knowledge-icon-button" onClick={resetConversation} type="button">
                <RotateCcw aria-hidden="true" size={17} strokeWidth={1.8} />
              </button>
              <button aria-label="关闭" className="knowledge-icon-button" onClick={closeChat} type="button">
                <X aria-hidden="true" size={19} strokeWidth={1.8} />
              </button>
            </header>

            {!knowledgeApiEnabled ? (
              <div className="knowledge-preview-notice mx-4 mt-3 flex gap-2.5 rounded-2xl px-3.5 py-3 text-xs leading-5 sm:mx-5">
                <Sparkles aria-hidden="true" className="mt-0.5 shrink-0" size={14} strokeWidth={1.8} />
                <span>当前构建未配置可用的知识库接口，只展示前端交互预览。</span>
              </div>
            ) : null}

            {serviceStatus === "unavailable" ? (
              <div className="knowledge-preview-notice is-unavailable mx-4 mt-3 flex gap-2.5 rounded-2xl px-3.5 py-3 text-xs leading-5 sm:mx-5">
                <Sparkles aria-hidden="true" className="mt-0.5 shrink-0" size={14} strokeWidth={1.8} />
                <span>网页已接入知识库地址，但后端或模型配置暂未通过健康检查。你仍可提问以重试连接。</span>
              </div>
            ) : null}

            <div aria-live="polite" aria-relevant="additions" className="knowledge-chat-messages flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5" ref={scrollRef} role="log">
              {messages.map((message) => (
                <article className={`knowledge-message flex gap-2.5 ${message.role === "user" ? "is-user" : "is-assistant"}`} key={message.id}>
                  {message.role === "assistant" ? <AssistantMark /> : null}
                  <div className="min-w-0 max-w-[84%]">
                    <div className="knowledge-message-bubble whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                    {message.role === "assistant" && message.retrievalTrace ? (
                      <RetrievalTracePanel trace={message.retrievalTrace} />
                    ) : null}
                    {message.sources?.length ? (
                      <div className="knowledge-sources mt-2.5">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-forest-muted-foreground">
                          <BookOpenText aria-hidden="true" size={12} />经历来源
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {message.sources.map((source) => (
                            <span className="knowledge-source-chip" key={`${source.title}-${source.period ?? ""}`}>
                              {source.title}{source.period ? ` · ${source.period}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {message.role === "assistant" && message.suggestions?.length ? (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {message.suggestions.map((suggestion) => (
                          <button className="knowledge-follow-up" key={suggestion} onClick={() => void askQuestion(suggestion)} type="button">
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {message.role === "user" ? (
                    <span className="knowledge-avatar is-user" aria-hidden="true"><UserRound size={15} strokeWidth={1.8} /></span>
                  ) : null}
                </article>
              ))}

              {isAnswering ? (
                <div className="knowledge-message is-assistant flex gap-2.5" role="status">
                  <AssistantMark />
                  <div className="knowledge-typing" aria-label="正在执行混合检索">
                    <BrainCircuit aria-hidden="true" className="knowledge-typing-icon" size={14} strokeWidth={1.8} />
                    <span className="knowledge-typing-label">正在执行混合检索</span>
                    <span className="knowledge-typing-dots" aria-hidden="true"><span /><span /><span /></span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="knowledge-composer-wrap px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
              {messages.length === 1 ? (
                <div className="knowledge-quick-prompts mb-3 flex gap-2 overflow-x-auto pb-1">
                  {starterQuestions.map(({ question }) => (
                    <button className="knowledge-quick-prompt" key={question} onClick={() => void askQuestion(question)} type="button">
                      {question}
                    </button>
                  ))}
                </div>
              ) : null}

              {error ? <p className="mb-2 px-1 text-xs font-semibold text-rose-200" role="alert">{error}</p> : null}

              <form className="knowledge-composer" onSubmit={submitQuestion}>
                <label className="sr-only" htmlFor="knowledge-question-input">输入关于 YYQ 经历的问题</label>
                <textarea
                  aria-label="输入关于 YYQ 经历的问题"
                  disabled={isAnswering}
                  id="knowledge-question-input"
                  maxLength={questionLimit}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="问一个关于工作经历或技术经验的问题…"
                  ref={inputRef}
                  rows={1}
                  value={input}
                />
                <button aria-label="发送问题" className="knowledge-send-button" disabled={!input.trim() || isAnswering} type="submit">
                  <Send aria-hidden="true" size={17} strokeWidth={1.9} />
                </button>
              </form>
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-forest-muted-foreground">
                <span className="hidden items-center gap-1.5 sm:flex"><CornerDownLeft aria-hidden="true" size={11} />Enter 发送 · Shift + Enter 换行</span>
                <span className="ml-auto">{input.length}/{questionLimit}</span>
              </div>
              <p className="mt-2 text-center text-[10px] leading-4 text-forest-muted-foreground">AI 回答可能存在偏差，请以公开简历及本人沟通为准。</p>
            </div>
          </div>
        </div>
      ) : null}
            </>,
            document.body
          )
        : null}
    </>
  );
}
