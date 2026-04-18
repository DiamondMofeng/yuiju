import { setTimeout } from "node:timers/promises";
import { type NCWebsocket, Structs } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { stickerState } from "@/state/sticker";
import {
  createStoredGroupMessageFromFetched,
  createStoredPrivateMessageFromFetched,
  getReplyDelayMs,
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
