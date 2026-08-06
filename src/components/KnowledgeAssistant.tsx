import {
  ArrowUpRight,
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  Check,
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
  knowledgeApiEnabled,
  type KnowledgeChatTurn,
  type KnowledgeSource
} from "@/lib/knowledge-chat";

type ChatMessage = {
  content: string;
  id: string;
  role: "assistant" | "user";
  sources?: KnowledgeSource[];
  suggestions?: string[];
};

const questionLimit = 300;

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
    content: `前端问答界面已经就绪。下一阶段接入 RAG 服务后，我会从杨烨齐公开的工作经历与技术资料中检索“${topic}”的相关内容，并在回答下方标注来源。`,
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

export function KnowledgeAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState("");
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
                className="knowledge-primary-action h-auto rounded-full px-6 py-3.5 text-sm text-[#082019] transition-transform hover:scale-[1.02]"
                onClick={() => openChat()}
                type="button"
              >
                开始提问
                <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />
              </Button>
              <span className="knowledge-preview-badge">
                <span className="knowledge-status-dot" />
                前端交互预览
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
                  <span className="knowledge-header-state"><Check aria-hidden="true" size={10} strokeWidth={2.4} /> UI 已就绪</span>
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
                <span>当前为前端预览。RAG 知识检索与真实回答将在下一阶段接入。</span>
              </div>
            ) : null}

            <div aria-live="polite" aria-relevant="additions" className="knowledge-chat-messages flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5" ref={scrollRef} role="log">
              {messages.map((message) => (
                <article className={`knowledge-message flex gap-2.5 ${message.role === "user" ? "is-user" : "is-assistant"}`} key={message.id}>
                  {message.role === "assistant" ? <AssistantMark /> : null}
                  <div className="max-w-[84%]">
                    <div className="knowledge-message-bubble whitespace-pre-wrap text-sm leading-6">{message.content}</div>
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
                  <div className="knowledge-typing" aria-label="正在生成回答"><span /><span /><span /></div>
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
