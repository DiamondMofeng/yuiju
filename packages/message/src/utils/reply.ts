import { setTimeout } from "node:timers/promises";
import type { Session } from "@satorijs/core";
import { type NCWebsocket, Structs } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { stickerState } from "@/state/sticker";
import {
  createStoredGroupMessageFromFetched,
  createStoredPrivateMessageFromFetched,
  createStoredSatoriGroupBotMessage,
  createStoredSatoriPrivateBotMessage,
  getReplyDelayMs,
  type StoredSatoriGroupMessage,
  type StoredSatoriPrivateMessage,
} from "@/utils/message";

/**
 * 发送并记录完整的私聊回复。
 */
export async function sendAndRecordPrivateReply(input: {
  napcat: NCWebsocket;
  userId: number;
  reply: string;
  sessionLabel: string;
}) {
  const replyLines = input.reply.split("\n").filter((line) => line.trim().length > 0);

  for (const [lineIndex, line] of replyLines.entries()) {
    const messageSegments = stickerState.buildMessageSegmentsFromLine(line);
    if (!messageSegments.length) {
      continue;
    }

    const sendResult = await input.napcat.send_private_msg({
      user_id: input.userId,
      message: messageSegments,
    });

    const sentMessage = await input.napcat.get_msg({
      message_id: sendResult.message_id,
    });

    if (sentMessage.message_type !== "private") {
      throw new Error(`Expected private message from get_msg, got ${sentMessage.message_type}`);
    }

    const storedSentMessage = await createStoredPrivateMessageFromFetched(
      sentMessage,
      input.napcat,
    );
    llmManager.recordPrivateMessage(storedSentMessage, input.sessionLabel);

    const nextLine = replyLines[lineIndex + 1];
    if (nextLine) {
      await setTimeout(getReplyDelayMs(nextLine));
    }
  }
}

/**
 * 发送并记录 Satori 私聊回复。
 */
export async function sendAndRecordSatoriPrivateReply(input: {
  session: Session;
  sourceMessage: StoredSatoriPrivateMessage;
  reply: string;
}) {
  if (!input.session.channelId) {
    return;
  }

  const replyLines = input.reply.split("\n").filter((line) => line.trim().length > 0);

  for (const [lineIndex, line] of replyLines.entries()) {
    const elements = stickerState.buildSatoriElementsFromLine(line);
    if (!elements.length) {
      continue;
    }

    const sentMessageIds = await input.session.bot.sendMessage(input.session.channelId, elements);
    const sentMessageId =
      sentMessageIds[0] ?? `${input.sourceMessage.messageId}:reply:${lineIndex}`;
    const storedSentMessage = await createStoredSatoriPrivateBotMessage({
      sourceMessage: input.sourceMessage,
      messageId: sentMessageId,
      elements,
      timestamp: Date.now(),
    });

    llmManager.recordPrivateMessage(storedSentMessage);

    const nextLine = replyLines[lineIndex + 1];
    if (nextLine) {
      await setTimeout(getReplyDelayMs(nextLine));
    }
  }
}

/**
 * 发送并记录完整的群聊回复。
 */
export async function sendAndRecordGroupReply(input: {
  napcat: NCWebsocket;
  groupId: number;
  sourceMessageId: number;
  reply: string;
  sessionLabel: string;
  shouldReplyToSourceMessage: boolean;
}) {
  const replyLines = input.reply.split("\n").filter((line) => line.trim().length > 0);
  let hasAttachedReplySegment = false;

  for (const [lineIndex, line] of replyLines.entries()) {
    const payloadSegments = stickerState.buildMessageSegmentsFromLine(line);
    if (!payloadSegments.length) {
      continue;
    }

    const shouldAttachReplySegment = input.shouldReplyToSourceMessage && !hasAttachedReplySegment;
    const messageSegments = shouldAttachReplySegment
      ? [Structs.reply(input.sourceMessageId), ...payloadSegments]
      : payloadSegments;

    const sendResult = await input.napcat.send_group_msg({
      group_id: input.groupId,
      message: messageSegments,
    });

    const sentMessage = await input.napcat.get_msg({
      message_id: sendResult.message_id,
    });

    if (sentMessage.message_type !== "group") {
      throw new Error(`Expected group message from get_msg, got ${sentMessage.message_type}`);
    }

    const storedSentMessage = await createStoredGroupMessageFromFetched(sentMessage, input.napcat);
    llmManager.recordGroupMessage(storedSentMessage, input.sessionLabel);

    if (shouldAttachReplySegment) {
      hasAttachedReplySegment = true;
    }

    const nextLine = replyLines[lineIndex + 1];
    if (nextLine) {
      await setTimeout(getReplyDelayMs(nextLine));
    }
  }
}

/**
 * 发送并记录 Satori 群聊回复。
 */
export async function sendAndRecordSatoriGroupReply(input: {
  session: Session;
  sourceMessage: StoredSatoriGroupMessage;
  reply: string;
}) {
  if (!input.session.channelId) {
    return;
  }

  const replyLines = input.reply.split("\n").filter((line) => line.trim().length > 0);

  for (const [lineIndex, line] of replyLines.entries()) {
    const elements = stickerState.buildSatoriElementsFromLine(line);
    if (!elements.length) {
      continue;
    }

    const sentMessageIds = await input.session.bot.sendMessage(input.session.channelId, elements);
    const sentMessageId =
      sentMessageIds[0] ?? `${input.sourceMessage.messageId}:reply:${lineIndex}`;
    const storedSentMessage = await createStoredSatoriGroupBotMessage({
      sourceMessage: input.sourceMessage,
      messageId: sentMessageId,
      elements,
      timestamp: Date.now(),
    });

    llmManager.recordGroupMessage(storedSentMessage);

    const nextLine = replyLines[lineIndex + 1];
    if (nextLine) {
      await setTimeout(getReplyDelayMs(nextLine));
    }
  }
}

/**
 * 发送并记录主动群消息。
 */
export async function sendAndRecordGroupProactiveMessage(input: {
  napcat: NCWebsocket;
  groupId: number;
  message: string;
  sessionLabel: string;
}): Promise<{
  sentMessageIds: number[];
}> {
  const replyLines = input.message.split("\n").filter((line) => line.trim().length > 0);
  const sentMessageIds: number[] = [];

  for (const [lineIndex, line] of replyLines.entries()) {
    const messageSegments = stickerState.buildMessageSegmentsFromLine(line);
    if (!messageSegments.length) {
      continue;
    }

    const sendResult = await input.napcat.send_group_msg({
      group_id: input.groupId,
      message: messageSegments,
    });

    sentMessageIds.push(sendResult.message_id);

    const sentMessage = await input.napcat.get_msg({
      message_id: sendResult.message_id,
    });

    if (sentMessage.message_type !== "group") {
      throw new Error(`Expected group message from get_msg, got ${sentMessage.message_type}`);
    }

    const storedSentMessage = await createStoredGroupMessageFromFetched(sentMessage, input.napcat);
    llmManager.recordGroupMessage(storedSentMessage, input.sessionLabel);

    const nextLine = replyLines[lineIndex + 1];
    if (nextLine) {
      await setTimeout(getReplyDelayMs(nextLine));
    }
  }

  return { sentMessageIds };
}
