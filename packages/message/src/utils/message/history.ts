import type {
  HistoryMessageSegment,
  StoredSatoriChatMessage,
  StoredSatoriGroupMessage,
} from "./types";

export function getGroupDisplayName(message: StoredSatoriGroupMessage): string {
  return message.sessionLabel;
}

export function getProtocolMessageSenderName(message: StoredSatoriChatMessage): string {
  return message.sender.displayName;
}

export function getProtocolMessageTimestampMs(message: StoredSatoriChatMessage): number {
  return message.timestamp;
}

export function getProtocolMessageId(message: StoredSatoriChatMessage): string {
  return message.messageId;
}

export function projectStoredMessageContent(
  message: StoredSatoriChatMessage,
): HistoryMessageSegment[] {
  return message.content;
}
