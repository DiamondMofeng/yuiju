import type { h, Session } from "@satorijs/core";
import type { AllHandlers, NCWebsocket, Receive } from "node-napcat-ts";

export type MessageSegment = Receive[keyof Receive];
export type AtMessageSegment = Extract<MessageSegment, { type: "at" }>;
export type FaceMessageSegment = Extract<MessageSegment, { type: "face" }>;
export type ImageMessageSegment = Extract<MessageSegment, { type: "image" }>;
export type ReplyMessageSegment = Extract<MessageSegment, { type: "reply" }>;
export type NonEnhancedMessageSegment = Exclude<
  MessageSegment,
  AtMessageSegment | FaceMessageSegment | ReplyMessageSegment | ImageMessageSegment
>;

export type RawGroupMessage = Omit<AllHandlers["message.group"], "quick_action">;
export type RawPrivateMessage = Omit<AllHandlers["message.private"], "quick_action">;
export type FetchedProtocolMessage = Awaited<ReturnType<NCWebsocket["get_msg"]>>;
export type FetchedGroupMessage = Extract<FetchedProtocolMessage, { message_type: "group" }>;
export type FetchedPrivateMessage = Extract<FetchedProtocolMessage, { message_type: "private" }>;

export interface ResolvedReplyMessage {
  messageId: number;
  messageType: "private" | "group";
  speaker: string;
  speakerUserId: number;
  time: number;
  rawMessage: string;
  message: EnhancedMessageSegment[];
}

export interface EnhancedAtSegment extends Omit<AtMessageSegment, "data"> {
  data: AtMessageSegment["data"] & {
    displayName: string;
    isSelf: boolean;
  };
}

export interface EnhancedReplySegment extends Omit<ReplyMessageSegment, "data"> {
  data: ReplyMessageSegment["data"] & {
    resolvedMessage: ResolvedReplyMessage | null;
  };
}

export interface EnhancedImageSegment extends Omit<ImageMessageSegment, "data"> {
  data: ImageMessageSegment["data"] & {
    description?: string;
  };
}

export interface EnhancedFaceSegment extends Omit<FaceMessageSegment, "data"> {
  data: {
    faceText?: string;
  };
}

export type EnhancedMessageSegment =
  | NonEnhancedMessageSegment
  | EnhancedFaceSegment
  | EnhancedImageSegment
  | EnhancedAtSegment
  | EnhancedReplySegment;

export type StoredGroupMessage = Omit<RawGroupMessage, "message" | "post_type"> & {
  post_type: "message" | "message_sent";
  message: EnhancedMessageSegment[];
};

export type StoredPrivateMessage = Omit<RawPrivateMessage, "message" | "post_type"> & {
  post_type: "message" | "message_sent";
  message: EnhancedMessageSegment[];
};

export interface StoredSatoriMessageSender {
  id: string;
  displayName: string;
  isSelf: boolean;
}

export interface StoredSatoriGroupMessage {
  source: "satori";
  scene: "group";
  platform: string;
  messageId: string;
  channelId: string;
  guildId?: string;
  sessionId: string;
  sessionLabel: string;
  sender: StoredSatoriMessageSender;
  timestamp: number;
  elements: h[];
  content: HistoryMessageSegment[];
  rawSession?: Session;
}

export interface StoredSatoriPrivateMessage {
  source: "satori";
  scene: "private";
  platform: string;
  messageId: string;
  channelId: string;
  sessionId: string;
  sessionLabel: string;
  sender: StoredSatoriMessageSender;
  timestamp: number;
  elements: h[];
  content: HistoryMessageSegment[];
  rawSession?: Session;
}

export type StoredSatoriChatMessage = StoredSatoriGroupMessage | StoredSatoriPrivateMessage;
export type StoredGroupChatMessage = StoredGroupMessage | StoredSatoriGroupMessage;
export type StoredPrivateChatMessage = StoredPrivateMessage | StoredSatoriPrivateMessage;
export type StoredChatMessage = StoredPrivateChatMessage | StoredGroupChatMessage;
export type StoredProtocolMessage = StoredChatMessage;

export interface HistoryReplySegment {
  type: "reply";
  data: {
    speaker?: string;
    content: HistoryMessageSegment[];
  };
}

export interface HistoryAtSegment {
  type: "at";
  data: {
    displayName: string;
  };
}

export interface HistoryImageSegment {
  type: "image";
  data: {
    description?: string;
  };
}

export type HistoryMessageSegment =
  | Exclude<EnhancedMessageSegment, EnhancedReplySegment | EnhancedAtSegment | EnhancedImageSegment>
  | HistoryImageSegment
  | HistoryAtSegment
  | HistoryReplySegment
  | h;

export interface HistoryMessageItem {
  speaker: string;
  time: string;
  content: HistoryMessageSegment[];
}

/**
 * 供 LLM 消费的结构化历史项。
 *
 * 说明：
 * - 这里只描述真实消息，不再混入滚动摘要；
 * - 摘要会由上层 prompt 以独立文本章节注入。
 */
export type HistoryJsonItem = HistoryMessageItem;

export interface BaseSegmentsTransferInput {
  napcat: NCWebsocket;
  segments: MessageSegment[];
  selfId: number;
  resolveReply: boolean;
}

export interface GroupSegmentsTransferInput extends BaseSegmentsTransferInput {
  scene: "group";
  groupId: number;
}

export interface PrivateSegmentsTransferInput extends BaseSegmentsTransferInput {
  scene: "private";
}

export type SegmentsTransferInput = GroupSegmentsTransferInput | PrivateSegmentsTransferInput;

export type ReplyMessage = FetchedProtocolMessage;
