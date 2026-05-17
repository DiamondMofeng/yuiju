import type {
  EnhancedMessageSegment,
  HistoryMessageSegment,
  RawGroupMessage,
  StoredChatMessage,
  StoredGroupChatMessage,
  StoredSatoriChatMessage,
} from "./types";

export function getGroupDisplayName(message: RawGroupMessage | StoredGroupChatMessage): string {
  if (isStoredSatoriMessage(message)) {
    return message.sessionLabel;
  }

  if ("group_name" in message && typeof message.group_name === "string") {
    const groupName = message.group_name.trim();
    if (groupName) {
      return groupName;
    }
  }

  return String(message.group_id);
}

/**
 * 获取协议消息发送者展示名，优先群名片，其次昵称，最后回退到 user_id。
 */
export function getProtocolMessageSenderName(message: StoredChatMessage): string {
  if (isStoredSatoriMessage(message)) {
    return message.sender.displayName;
  }

  return message?.sender?.card || message?.sender?.nickname || String(message?.sender?.user_id);
}

export function getProtocolMessageTimestampMs(message: StoredChatMessage): number {
  if (isStoredSatoriMessage(message)) {
    return message.timestamp;
  }

  return message.time * 1000;
}

export function getProtocolMessageId(message: StoredChatMessage): string {
  if (isStoredSatoriMessage(message)) {
    return message.messageId;
  }

  return String(message.message_id);
}

export function projectStoredMessageContent(message: StoredChatMessage): HistoryMessageSegment[] {
  if (isStoredSatoriMessage(message)) {
    return message.content;
  }

  return projectHistoryMessageContent(message.message);
}

export function isStoredSatoriMessage(message: unknown): message is StoredSatoriChatMessage {
  return Boolean(
    message && typeof message === "object" && (message as { source?: string }).source === "satori",
  );
}

/**
 * 将增强后的消息段进一步投影为更适合 LLM 理解的历史内容。
 *
 * 说明：
 * - 顶层 `reply` 仅保留“引用了谁”和“引用内容是什么”；
 * - reply 的冗余元数据（id、时间、raw_message 等）会被剔除；
 * - 嵌套 reply 不再继续保留，避免引用链层层展开。
 */
export function projectHistoryMessageContent(
  segments: EnhancedMessageSegment[],
): HistoryMessageSegment[] {
  return segments.map<HistoryMessageSegment>((segment) => {
    if (segment.type === "at") {
      return {
        type: "at",
        data: {
          displayName: segment.data.displayName,
        },
      };
    }

    if (segment.type === "image") {
      return {
        type: "image",
        data: {
          description: segment.data.description,
        },
      };
    }

    if (segment.type !== "reply") {
      return segment;
    }

    const resolvedMessage = segment.data.resolvedMessage;
    const content = resolvedMessage ? projectReplyContentSegments(resolvedMessage.message) : [];

    return {
      type: "reply",
      data: {
        speaker: resolvedMessage?.speaker,
        content,
      },
    };
  });
}
function projectReplyContentSegments(segments: EnhancedMessageSegment[]): HistoryMessageSegment[] {
  return segments.flatMap<HistoryMessageSegment>((segment) => {
    if (segment.type === "reply") {
      return [];
    }

    if (segment.type === "at") {
      return [
        {
          type: "at",
          data: {
            displayName: segment.data.displayName,
          },
        },
      ];
    }

    if (segment.type === "image") {
      return [
        {
          type: "image",
          data: {
            description: segment.data.description,
          },
        },
      ];
    }

    return [segment];
  });
}
