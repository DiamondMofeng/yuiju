import type { AllHandlers, NCWebsocket } from "node-napcat-ts";

type GroupMessageContext = AllHandlers["message.group"];

export interface ParsedGroupMessage {
  groupDisplayName: string;
  senderName: string;
  plainText: string;
  textForLLM: string;
  isAtBot: boolean;
}

/**
 * 统一解析群消息，提取后续决策与回复真正关心的字段。
 *
 * 说明：
 * - 文本内容与 mention 会按原始顺序一起重建，避免丢失“这句话在对谁说”的语义；
 * - 是否 @ 机器人通过结构化 at segment 判断，避免依赖 raw_message 字符串解析；
 * - 对其他被 @ 的用户，会通过 Napcat 查询群名片/昵称，让模型看到更自然的称呼。
 */
export async function parseGroupMessage(
  context: GroupMessageContext,
  napcat: NCWebsocket,
): Promise<ParsedGroupMessage> {
  let isAtBot = false;
  const textList: string[] = [];
  const normalizedSegmentList: string[] = [];
  const memberNameCache = new Map<string, string>();

  for (const segment of context.message) {
    if (segment.type === "at") {
      const normalizedMention = await normalizeMentionSegment({
        context,
        napcat,
        mentionQQ: segment.data.qq,
        memberNameCache,
      });

      if (segment.data.qq === String(context.self_id)) {
        isAtBot = true;
      }

      normalizedSegmentList.push(normalizedMention);
      continue;
    }

    if (segment.type === "text") {
      textList.push(segment.data.text);
      normalizedSegmentList.push(segment.data.text);
    }
  }

  const plainText = textList.join("").trim();
  const normalizedText = normalizedSegmentList.join("").trim();

  return {
    groupDisplayName: getGroupDisplayName(context),
    senderName: getSenderDisplayName(context),
    plainText,
    textForLLM: buildTextForLLM(normalizedText, isAtBot),
    isAtBot,
  };
}

function getSenderDisplayName(context: GroupMessageContext): string {
  const card = context.sender.card?.trim();
  const nickname = context.sender.nickname?.trim();
  return card || nickname || String(context.sender.user_id);
}

function getGroupDisplayName(context: GroupMessageContext): string {
  if ("group_name" in context && typeof context.group_name === "string") {
    const groupName = context.group_name.trim();
    if (groupName) {
      return groupName;
    }
  }

  return String(context.group_id);
}

function buildTextForLLM(normalizedText: string, isAtBot: boolean): string {
  if (normalizedText) {
    return normalizedText;
  }

  if (isAtBot) {
    return "（对方只提及了你，没有附带文字）";
  }

  return "";
}

/**
 * 将群消息中的 @ segment 转成更适合 LLM 理解的自然文本。
 *
 * 说明：
 * - @ 机器人会固定转成 `[提及悠酱]`；
 * - @ 全体成员会转成 `[@全体成员]`；
 * - @ 其他成员会尽量查询群名片/昵称，失败时再回退到 QQ 号。
 */
async function normalizeMentionSegment(input: {
  context: GroupMessageContext;
  napcat: NCWebsocket;
  mentionQQ: string | "all";
  memberNameCache: Map<string, string>;
}) {
  if (input.mentionQQ === "all") {
    return "[@全体成员]";
  }

  if (input.mentionQQ === String(input.context.self_id)) {
    return "[提及悠酱]";
  }

  const memberName = await getMentionedMemberName(input);
  return `[@${memberName}]`;
}

async function getMentionedMemberName(input: {
  context: GroupMessageContext;
  napcat: NCWebsocket;
  mentionQQ: string;
  memberNameCache: Map<string, string>;
}) {
  const cachedName = input.memberNameCache.get(input.mentionQQ);
  if (cachedName) {
    return cachedName;
  }

  try {
    const memberInfo = await input.napcat.get_group_member_info({
      group_id: input.context.group_id,
      user_id: Number(input.mentionQQ),
      no_cache: false,
    });

    const displayName =
      memberInfo.card?.trim() || memberInfo.nickname?.trim() || `QQ:${input.mentionQQ}`;
    input.memberNameCache.set(input.mentionQQ, displayName);
    return displayName;
  } catch (error) {
    console.error(
      `查询群 ${input.context.group_id} 成员 ${input.mentionQQ} 信息失败，回退到 QQ 号展示`,
      error,
    );
    const fallbackName = `QQ:${input.mentionQQ}`;
    input.memberNameCache.set(input.mentionQQ, fallbackName);
    return fallbackName;
  }
}
