"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, type TextUIPart, type UIMessage } from "ai";
import dayjs from "dayjs";
import { MessageSquare } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type HomePageHeaderProps = {
  summary?: string;
};

type MessageMetadata = {
  createdAt?: number;
};

type HomeUIMessage = UIMessage<MessageMetadata>;
type PersistedTextPart = Pick<TextUIPart, "type" | "text">;
type PersistedHomeMessage = {
  id: string;
  role: "user" | "assistant";
  metadata?: MessageMetadata;
  parts: PersistedTextPart[];
};

const USER_NAME_KEY = "yuiju:user_name";
const DEFAULT_USER_NAME = "渺小久";
const HISTORY_KEY_PREFIX = "yuiju:chat_history:";
const HISTORY_LIMIT = 20;

// 关键函数：生成聊天历史的 localStorage key，空值会回退到默认名。
const getHistoryKey = (userName: string) => {
  const normalized = userName.trim() || DEFAULT_USER_NAME;
  return `${HISTORY_KEY_PREFIX}${normalized}`;
};

const formatTime = (value: number | Date = new Date()) => {
  return dayjs(value).format("HH:mm");
};

// 关键函数：统一生成文本 part，避免对象字面量被推宽成泛型 string。
const createTextPart = (text: string): TextUIPart => ({
  type: "text",
  text,
});

// 关键函数：从 UIMessage 中提取可持久化的纯文本片段，过滤掉 tool/data 等运行态内容。
const getPersistedTextParts = (message: HomeUIMessage): PersistedTextPart[] => {
  return message.parts.filter(isTextUIPart).map((part) => createTextPart(part.text));
};

// 关键函数：把本地存储结构恢复成 AI SDK 当前版本可识别的 UIMessage。
const createHomeMessage = (input: PersistedHomeMessage): HomeUIMessage => {
  return {
    id: input.id,
    role: input.role,
    metadata: input.metadata,
    parts: input.parts.map((part) => createTextPart(part.text)),
  };
};

const isPersistedHomeMessage = (value: unknown): value is PersistedHomeMessage => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PersistedHomeMessage>;
  if (typeof candidate.id !== "string") return false;
  if (candidate.role !== "user" && candidate.role !== "assistant") return false;
  if (!Array.isArray(candidate.parts)) return false;

  return candidate.parts.every((part) => part?.type === "text" && typeof part.text === "string");
};

const isPersistableMessage = (
  message: HomeUIMessage,
): message is HomeUIMessage & { role: "user" | "assistant" } => {
  return message.role === "user" || message.role === "assistant";
};

// 核心逻辑：解析本地缓存消息，仅保留安全的文本结构。
const parseHistory = (raw: string | null): HomeUIMessage[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isPersistedHomeMessage).map((item) =>
      createHomeMessage({
        id: item.id,
        role: item.role,
        metadata:
          typeof item.metadata?.createdAt === "number"
            ? { createdAt: item.metadata.createdAt }
            : undefined,
        parts: item.parts,
      }),
    );
  } catch {
    return [];
  }
};

const serializeMessages = (items: HomeUIMessage[]): PersistedHomeMessage[] => {
  return items
    .filter(isPersistableMessage)
    .map((item) => ({
      id: item.id,
      role: item.role,
      metadata: item.metadata?.createdAt ? { createdAt: item.metadata.createdAt } : undefined,
      parts: getPersistedTextParts(item),
    }))
    .filter((item) => item.parts.length > 0);
};

export function HomePageHeader({ summary }: HomePageHeaderProps) {
  const displaySummary = summary ?? "—";
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [userName, setUserName] = useState(DEFAULT_USER_NAME);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat<HomeUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const messageCount = messages.length;
  const isSending = status === "submitted" || status === "streaming";

  // Review: react 在组件中的顺序。从上到下一般是 useState、useRef、useMemo、useCallback、useEffect
  const emptyHint = useMemo(() => {
    if (isSending) {
      return "悠酱思考中…";
    }
    return "现在可以开始聊天啦";
  }, [isSending]);

  // 复杂边界：序列化体积过大或写入失败时，自动降级截断。
  const persistMessages = useCallback(
    (nextMessages: HomeUIMessage[]) => {
      if (!Array.isArray(nextMessages)) {
        console.error("Invalid messages format");
        return { didTrim: false, next: [] as HomeUIMessage[] };
      }

      const sanitizedMessages: HomeUIMessage[] = nextMessages
        .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
        .map(item => ({
          id: item.id,
          role: item.role,
          metadata: item.metadata?.createdAt ? { createdAt: item.metadata.createdAt } : undefined,
          parts: item.parts.filter(isTextUIPart),
        }));

      const limitedMessages = sanitizedMessages.slice(-HISTORY_LIMIT);
      let finalMessages: HomeUIMessage[] = limitedMessages;
      let didTrim = sanitizedMessages.length > limitedMessages.length;

      try {
        const serialized = JSON.stringify(serializeMessages(limitedMessages));
        if (serialized.length > 5120) {
          console.warn("Message data too large, truncating further");
          finalMessages = limitedMessages.slice(-Math.floor(HISTORY_LIMIT / 2));
          didTrim = true;
        }
        localStorage.setItem(getHistoryKey(userName), JSON.stringify(serializeMessages(finalMessages)));
      } catch (error) {
        console.error("Failed to persist messages:", error);
        finalMessages = limitedMessages.slice(-3);
        didTrim = true;
        try {
          localStorage.setItem(getHistoryKey(userName), JSON.stringify(serializeMessages(finalMessages)));
        } catch (e) {
          console.error("Emergency persistence failed:", e);
        }
      }

      return {
        didTrim,
        next: finalMessages,
      };
    },
    [userName],
  );

  useEffect(() => {
    if (!isChatOpen) return;
    const { didTrim, next } = persistMessages(messages);
    if (didTrim && next.length < messages.length) {
      setMessages(next);
    }
  }, [isChatOpen, messages, persistMessages, setMessages]);

  useEffect(() => {
    if (!error) return;
    if (lastErrorRef.current === error.message) return;
    lastErrorRef.current = error.message;
    setMessages((prev) => [
      ...prev,
      createHomeMessage({
        id: `error-${Date.now()}`,
        role: "assistant",
        metadata: { createdAt: Date.now() },
        parts: [createTextPart(`出错了：${error.message}`)],
      }),
    ]);
  }, [error, setMessages]);

  const handleSend = async () => {
    if (isSending) return;
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setInputValue("");
    if (error) {
      clearError();
    }
    await sendMessage(
      {
        text: trimmed,
        metadata: { createdAt: Date.now() },
      },
      {
        body: { userName },
      },
    );
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };
  const handleClear = () => {
    localStorage.removeItem(getHistoryKey(userName));
    setMessages([]);
  };

  useEffect(() => {
    if (!isChatOpen) return;
    const storedUserName = localStorage.getItem(USER_NAME_KEY);
    const resolvedUserName = storedUserName?.trim() ? storedUserName.trim() : DEFAULT_USER_NAME;
    const nextHistoryKey = getHistoryKey(resolvedUserName);
    let historyRaw = localStorage.getItem(nextHistoryKey);

    // 兼容旧默认值为空时的历史记录 key。
    if (!storedUserName?.trim()) {
      const legacyKey = `${HISTORY_KEY_PREFIX}`;
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!historyRaw && legacyRaw) {
        historyRaw = legacyRaw;
        localStorage.setItem(nextHistoryKey, legacyRaw);
        localStorage.removeItem(legacyKey);
      }
    }

    setUserName(resolvedUserName);
    setMessages(parseHistory(historyRaw));
  }, [isChatOpen, setMessages]);

  useEffect(() => {
    if (!isChatOpen) return;
    if (messageCount === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isChatOpen, messageCount]);

  useEffect(() => {
    if (!isChatOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChatOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isChatOpen]);

  return (
    <>
      <div className="flex items-end justify-between gap-[16px] mt-[18px] mb-[14px] max-[1020px]:flex-col max-[1020px]:items-start">
        <div>
          <h1 className="m-0 text-[18px] font-extrabold tracking-[0.2px]">首页</h1>
        </div>

        <div className="flex items-center gap-[10px] flex-wrap">
          <Badge variant="pill" size="default" className="whitespace-nowrap">
            <span className="text-[#6b7480]">一句话：</span>
            <strong className="text-[#2b2f36]">{displaySummary}</strong>
          </Badge>
          <Button variant="secondary" type="button" onClick={() => setIsChatOpen(true)}>
            <MessageSquare className="h-[18px] w-[18px] text-[#2b2f36]" strokeWidth={1.6} />
            手机聊天
          </Button>
        </div>
      </div>

      {isChatOpen ? (
        <div className="fixed inset-0 bg-[rgba(15,22,30,0.35)] grid items-stretch justify-items-end z-40">
          <Button
            type="button"
            variant="outline"
            className="absolute inset-0 h-auto w-auto p-0 bg-transparent hover:bg-transparent"
            aria-label="关闭聊天抽屉"
            onClick={() => setIsChatOpen(false)}
          />
          <section
            className="relative w-[min(420px,100%)] max-[520px]:w-full h-full bg-white/95 border-l border-[rgba(217,230,245,0.9)] shadow-[-20px_0_40px_rgba(15,22,30,0.12)] grid grid-rows-[auto_1fr_auto]"
            role="dialog"
            aria-modal="true"
            aria-label="手机聊天"
          >
            <header className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-[rgba(217,230,245,0.85)]">
              <div className="grid gap-1 text-base font-black text-[#2b2f36]">
                <strong>手机聊天</strong>
                <span className="text-xs font-semibold text-[#6b7480]">@{userName || "—"}</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Badge variant="soft" size="sm">
                  {messageCount} 条
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                >
                  关闭
                </Button>
              </div>
            </header>

            <div className="px-4 py-3 grid overflow-hidden">
              <div className="grid gap-2.5 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <div className="m-auto text-[#6b7480] text-[13px] text-center">{emptyHint}</div>
                ) : (
                  messages.map((item) => {
                    const text = item.parts
                      .filter(isTextUIPart)
                      .map((part) => part.text)
                      .join("");
                    const time = item.metadata?.createdAt
                      ? formatTime(item.metadata.createdAt)
                      : undefined;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "max-w-[82%] px-3 py-2.5 rounded-[14px] text-[13px] leading-[1.55] whitespace-pre-wrap break-words",
                          item.role === "user"
                            ? "justify-self-end bg-[rgba(145,196,238,0.22)] border border-[rgba(145,196,238,0.4)] text-[#2b2f36]"
                            : "justify-self-start bg-[rgba(247,251,255,0.94)] border border-[rgba(217,230,245,0.9)] text-[#2b2f36]",
                        )}
                      >
                        <div className="whitespace-pre-wrap">{text}</div>
                        {time ? (
                          <div className="mt-1.5 text-[11px] text-[#6b7480] text-right">{time}</div>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <footer className="border-t border-[rgba(217,230,245,0.85)] px-4 pt-3 pb-4 grid gap-2">
              <Textarea
                className="min-h-[80px] max-h-[160px] resize-y"
                placeholder="输入内容，Enter 发送，Shift+Enter 换行"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
                rows={3}
              />
              <div className="flex items-center justify-between gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleClear}
                  disabled={messages.length === 0}
                >
                  清空
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isSending || !inputValue.trim()}
                >
                  {isSending ? "发送中..." : "发送"}
                </Button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
