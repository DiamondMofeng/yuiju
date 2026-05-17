import { SUBJECT_NAME } from "@yuiju/utils";
import type { NCWebsocket } from "node-napcat-ts";
import { logger } from "@/utils/logger";
import { resolveImageSegment } from "./image";
import type {
  AtMessageSegment,
  EnhancedAtSegment,
  EnhancedMessageSegment,
  EnhancedReplySegment,
  FetchedGroupMessage,
  FetchedPrivateMessage,
  NonEnhancedMessageSegment,
  RawGroupMessage,
  RawPrivateMessage,
  ReplyMessage,
  ReplyMessageSegment,
  ResolvedReplyMessage,
  SegmentsTransferInput,
  StoredGroupMessage,
  StoredPrivateMessage,
} from "./types";

export async function isGroupMessageDirectedToBot(
  message: RawGroupMessage | StoredGroupMessage,
  napcat: NCWebsocket,
): Promise<{
  type?: "at" | "reply";
  isDriectedToBot: boolean;
}> {
  try {
    for (const segment of message.message) {
      if (segment.type === "at") {
        return {
          type: "at",
          isDriectedToBot: segment.data.qq === String(message.self_id),
        };
      }
      if (segment.type === "reply") {
        const replyMessage = await napcat.get_msg({
          message_id: Number(segment.data.id),
        });

        return {
          type: "reply",
          isDriectedToBot: replyMessage?.sender?.user_id === message.self_id,
        };
      }
    }
  } catch (error) {
    logger.error("isGroupMessageDirectedToBot", error);
  }

  return {
    type: undefined,
    isDriectedToBot: false,
  };
}

/**
 * 将 Napcat 原始消息段增强为更适合 LLM 理解的结构化消息段。
 *
 * 说明：
 * - `at` 会补齐展示昵称；
 * - `reply` 会直接拉取被引用消息，并只展开一层；
 * - 其他消息段保持原始结构，避免额外包装。
 */
export async function segmentsTransfer(
  input: SegmentsTransferInput,
): Promise<EnhancedMessageSegment[]> {
  return Promise.all(
    input.segments.map(async (segment) => {
      switch (segment.type) {
        case "text":
          return segment;
        case "image":
          return resolveImageSegment(segment);
        case "face":
          return {
            type: "face",
            data: {
              faceText: segment.data.raw.faceText,
            },
          };
        case "record":
        case "video":
        case "file":
          return segment;
        case "at":
          return resolveAtSegment(segment, input);
        case "reply":
          return resolveReplySegment(segment, input);
        default:
          return segment as NonEnhancedMessageSegment;
      }
    }),
  );
}

/**
 * 将群聊原始消息转换为 session 中保存的增强消息。
 */
export async function createStoredGroupMessage(
  message: RawGroupMessage,
  napcat: NCWebsocket,
): Promise<StoredGroupMessage> {
  return {
    ...message,
    message: await segmentsTransfer({
      napcat,
      segments: message.message,
      selfId: message.self_id,
      scene: "group",
      groupId: message.group_id,
      resolveReply: true,
    }),
  };
}

/**
 * 将 Napcat `get_msg` 取回的群消息转换为 session 中保存的增强消息。
 *
 * 说明：
 * - 主要用于发送成功后回读机器人自己的真实消息；
 * - 保留 Napcat 实际返回的 `message_id`、`post_type` 等字段，避免手工构造漂移。
 */
export async function createStoredGroupMessageFromFetched(
  message: FetchedGroupMessage,
  napcat: NCWebsocket,
): Promise<StoredGroupMessage> {
  return {
    ...message,
    message: await segmentsTransfer({
      napcat,
      segments: message.message,
      selfId: message.self_id,
      scene: "group",
      groupId: message.group_id,
      resolveReply: true,
    }),
  };
}

/**
 * 将私聊原始消息转换为 session 中保存的增强消息。
 */
export async function createStoredPrivateMessage(
  message: RawPrivateMessage,
  napcat: NCWebsocket,
): Promise<StoredPrivateMessage> {
  return {
    ...message,
    message: await segmentsTransfer({
      napcat,
      segments: message.message,
      selfId: message.self_id,
      scene: "private",
      resolveReply: true,
    }),
  };
}

/**
 * 将 Napcat `get_msg` 取回的私聊消息转换为 session 中保存的增强消息。
 *
 * 说明：
 * - 主要用于发送成功后回读机器人自己的真实消息；
 * - 和收到用户私聊时使用同一套消息增强逻辑，保证历史上下文结构一致。
 */
export async function createStoredPrivateMessageFromFetched(
  message: FetchedPrivateMessage,
  napcat: NCWebsocket,
): Promise<StoredPrivateMessage> {
  return {
    ...message,
    message: await segmentsTransfer({
      napcat,
      segments: message.message,
      selfId: message.self_id,
      scene: "private",
      resolveReply: true,
    }),
  };
}

async function resolveAtSegment(
  segment: AtMessageSegment,
  input: SegmentsTransferInput,
): Promise<EnhancedAtSegment> {
  const qq = segment.data.qq;

  if (qq === "all") {
    return {
      ...segment,
      data: {
        ...segment.data,
        displayName: "全体成员",
        isSelf: false,
      },
    };
  }

  if (qq === String(input.selfId)) {
    return {
      ...segment,
      data: {
        ...segment.data,
        displayName: SUBJECT_NAME,
        isSelf: true,
      },
    };
  }

  const displayName =
    input.scene === "group"
      ? await resolveGroupMemberDisplayName(input.napcat, input.groupId, qq)
      : await resolvePrivateMentionDisplayName(input.napcat, qq);

  return {
    ...segment,
    data: {
      ...segment.data,
      displayName,
      isSelf: false,
    },
  };
}

async function resolveReplySegment(
  segment: ReplyMessageSegment,
  input: SegmentsTransferInput,
): Promise<EnhancedReplySegment> {
  if (!input.resolveReply) {
    return {
      ...segment,
      data: {
        ...segment.data,
        resolvedMessage: null,
      },
    };
  }

  const resolvedMessage = await getResolvedReplyMessage(
    segment.data.id,
    input.napcat,
    input.selfId,
  );

  return {
    ...segment,
    data: {
      ...segment.data,
      resolvedMessage,
    },
  };
}

async function resolveGroupMemberDisplayName(
  napcat: NCWebsocket,
  groupId: number,
  qq: string,
): Promise<string> {
  const userId = Number(qq);
  if (Number.isNaN(userId)) {
    return qq;
  }

  try {
    const member = await napcat.get_group_member_info({
      group_id: groupId,
      user_id: userId,
    });

    return member.card || member.nickname || String(member.user_id);
  } catch {
    return qq;
  }
}

async function resolvePrivateMentionDisplayName(napcat: NCWebsocket, qq: string): Promise<string> {
  const userId = Number(qq);
  if (Number.isNaN(userId)) {
    return qq;
  }

  try {
    const stranger = await napcat.get_stranger_info({
      user_id: userId,
    });

    return stranger.nickname?.trim() || String(stranger.user_id);
  } catch {
    return qq;
  }
}

async function getResolvedReplyMessage(
  replyMessageId: string,
  napcat: NCWebsocket,
  selfId: number,
): Promise<ResolvedReplyMessage | null> {
  const messageId = Number(replyMessageId);
  if (Number.isNaN(messageId)) {
    return null;
  }

  try {
    const message = await napcat.get_msg({ message_id: messageId });
    return buildResolvedReplyMessage(message, napcat, selfId);
  } catch {
    return null;
  }
}

async function buildResolvedReplyMessage(
  message: ReplyMessage,
  napcat: NCWebsocket,
  selfId: number,
): Promise<ResolvedReplyMessage> {
  const storedMessage = await segmentsTransfer(
    message.message_type === "group"
      ? {
          napcat,
          segments: message.message,
          selfId,
          scene: "group",
          groupId: message.group_id,
          resolveReply: false,
        }
      : {
          napcat,
          segments: message.message,
          selfId,
          scene: "private",
          resolveReply: false,
        },
  );

  return {
    messageId: message.message_id,
    messageType: message.message_type,
    speaker:
      message.sender.card?.trim() ||
      message.sender.nickname?.trim() ||
      String(message.sender.user_id),
    speakerUserId: message.sender.user_id,
    time: message.time,
    rawMessage: message.raw_message,
    message: storedMessage,
  };
}
