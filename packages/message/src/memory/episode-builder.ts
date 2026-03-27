import type { MemoryEpisode } from "@yuiju/utils";
import { DEFAULT_MEMORY_SUBJECT_ID, getTimeWithWeekday } from "@yuiju/utils";
import dayjs from "dayjs";

export interface ChatWindowMessageItem {
  speaker_name: string;
  content: string;
  timestamp: string;
}

export interface UserWindowState {
  windowStartMs: number;
  lastTsMs: number;
  messages: ChatWindowMessageItem[];
}

interface ConversationEpisodePayload {
  subjectName: string;
  counterpartyName: string;
  windowStart: string;
  windowEnd: string;
  messageCount: number;
  messages: ChatWindowMessageItem[];
}

/**
 * 构建对话窗口 Episode。
 *
 * 说明：
 * - summaryText 使用稳定模板，避免当前阶段引入额外 LLM 摘要依赖；
 * - payload 保留完整消息窗口，方便后续恢复服务端接线时直接复用。
 */
export function buildConversationEpisode(input: {
  counterpartyName: string;
  state: UserWindowState;
  isDev: boolean;
}): MemoryEpisode<ConversationEpisodePayload> {
  const windowStart = new Date(input.state.windowStartMs);
  const windowEnd = new Date(input.state.lastTsMs);
  const messageCount = input.state.messages.length;
  const previewText = input.state.messages
    .slice(-3)
    .map((message) => `${message.speaker_name}：${message.content}`)
    .join(" | ");

  return {
    source: "chat",
    type: "conversation",
    subject: DEFAULT_MEMORY_SUBJECT_ID,
    counterparty: input.counterpartyName,
    happenedAt: windowEnd,
    summaryText: [
      `悠酱与 ${input.counterpartyName} 完成了一段对话窗口归档`,
      `时间范围：${getTimeWithWeekday(dayjs(windowStart))} 至 ${getTimeWithWeekday(dayjs(windowEnd))}`,
      `消息数量：${messageCount}`,
      previewText ? `最近内容：${previewText}` : undefined,
    ]
      .filter(Boolean)
      .join("；"),
    extractionStatus: "pending",
    isDev: input.isDev,
    payload: {
      subjectName: DEFAULT_MEMORY_SUBJECT_ID,
      counterpartyName: input.counterpartyName,
      windowStart: getTimeWithWeekday(dayjs(windowStart)),
      windowEnd: getTimeWithWeekday(dayjs(windowEnd)),
      messageCount,
      messages: input.state.messages,
    },
  };
}
