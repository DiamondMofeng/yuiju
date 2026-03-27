import type { MemoryServiceClient } from "@yuiju/utils";
import {
  emitMemoryEpisode,
  getTimeWithWeekday,
  isDev,
  processPendingMemoryEpisodes,
} from "@yuiju/utils";
import type { ModelMessage } from "ai";
import dayjs from "dayjs";
import { buildConversationEpisode, type UserWindowState } from "./memory/episode-builder";

type Role = "user" | "assistant";

const SUBJECT_NAME = "ゆいじゅ";

interface ConversationEntry {
  role: Role;
  content: string;
  timeMs: number;
}

export interface ChatMessageInput {
  counterparty_name: string;
  role: Role;
  content: string;
  timestamp: Date;
}

export interface ChatSessionManagerOptions {
  conversationLimit?: number;
  conversationTtlMs?: number;
  windowMs?: number;
  memoryClient?: MemoryServiceClient | null;
}

export class ChatSessionManager {
  private conversationByCounterparty = new Map<string, ConversationEntry[]>();
  private windowStateByCounterparty = new Map<string, UserWindowState>();

  private conversationLimit: number;
  private conversationTtlMs: number;
  private windowMs: number;
  private isDev: boolean;

  constructor(options: ChatSessionManagerOptions = {}) {
    this.conversationLimit = options.conversationLimit ?? 20;
    this.conversationTtlMs = options.conversationTtlMs ?? 3600 * 1000;
    this.windowMs = options.windowMs ?? 20 * 60 * 1000;
    this.isDev = isDev();
  }

  recordMessage(input: ChatMessageInput) {
    this.appendConversationEntry(input);
    this.appendWindowMessage(input);
  }

  getLLMMessages(counterparty_name: string): ModelMessage[] {
    const nowMs = Date.now();
    const cutoffMs = nowMs - this.conversationTtlMs;
    const list = this.conversationByCounterparty.get(counterparty_name) ?? [];

    const filtered = list.filter((e) => e.timeMs >= cutoffMs);
    const trimmed =
      filtered.length > this.conversationLimit
        ? filtered.slice(filtered.length - this.conversationLimit)
        : filtered;

    if (trimmed.length !== list.length) {
      this.conversationByCounterparty.set(counterparty_name, trimmed);
    }

    return trimmed.map((e) => {
      if (e.role === "user") {
        const timeText = getTimeWithWeekday(dayjs(e.timeMs));
        return { role: e.role, content: `${e.content}\n\n[用户发送时间：${timeText}]` };
      }

      return { role: e.role, content: e.content };
    });
  }

  async flushUserWindow(counterparty_name: string) {
    const state = this.windowStateByCounterparty.get(counterparty_name);
    if (!state) return;

    this.windowStateByCounterparty.delete(counterparty_name);
    await this.writeChatWindowEpisode(counterparty_name, state);
  }

  private appendConversationEntry(input: ChatMessageInput) {
    const nowMs = Date.now();
    const cutoffMs = nowMs - this.conversationTtlMs;

    const list = this.conversationByCounterparty.get(input.counterparty_name) ?? [];
    list.push({
      role: input.role,
      content: input.content,
      timeMs: input.timestamp.getTime(),
    });

    const filtered = list.filter((e) => e.timeMs >= cutoffMs);
    const trimmed =
      filtered.length > this.conversationLimit
        ? filtered.slice(filtered.length - this.conversationLimit)
        : filtered;

    this.conversationByCounterparty.set(input.counterparty_name, trimmed);
  }

  private appendWindowMessage(input: ChatMessageInput) {
    const tsMs = input.timestamp.getTime();
    const state = this.windowStateByCounterparty.get(input.counterparty_name);
    const speaker_name = input.role === "user" ? input.counterparty_name : SUBJECT_NAME;

    if (!state) {
      this.windowStateByCounterparty.set(input.counterparty_name, {
        windowStartMs: tsMs,
        lastTsMs: tsMs,
        messages: [
          {
            speaker_name,
            content: input.content,
            timestamp: getTimeWithWeekday(dayjs(input.timestamp)),
          },
        ],
      });
      return;
    }

    const gapMs = tsMs - state.lastTsMs;
    if (gapMs > this.windowMs) {
      this.windowStateByCounterparty.delete(input.counterparty_name);
      void this.writeChatWindowEpisode(input.counterparty_name, state).catch(() => {});

      this.windowStateByCounterparty.set(input.counterparty_name, {
        windowStartMs: tsMs,
        lastTsMs: tsMs,
        messages: [
          {
            speaker_name,
            content: input.content,
            timestamp: getTimeWithWeekday(dayjs(input.timestamp)),
          },
        ],
      });
      return;
    }

    state.lastTsMs = tsMs;
    state.messages.push({
      speaker_name,
      content: input.content,
      timestamp: getTimeWithWeekday(dayjs(input.timestamp)),
    });
  }

  private async writeChatWindowEpisode(counterparty_name: string, state: UserWindowState) {
    const episode = buildConversationEpisode({
      counterpartyName: counterparty_name,
      state,
      isDev: this.isDev,
    });

    try {
      await emitMemoryEpisode(episode);
      processPendingMemoryEpisodes({ limit: 1, isDev: this.isDev }).catch((error) => {
        console.error("Failed to process pending memory episodes:", error);
      });
    } catch (error) {
      console.error("Failed to write chat window episode:", error);
      return;
    }
  }
}
