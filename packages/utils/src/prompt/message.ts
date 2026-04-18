import { NICKNAME, SUBJECT_NAME } from "../constants";
import { baseInformation, characterPersonalityPrompt } from "./character-card";

export interface MessageHistoryUserPromptInput {
  summary?: string;
  historyJson: string;
  latestMessageDirectedType?: "at" | "reply";
}

export interface MessageSummaryPromptInput {
  sessionLabel: string;
  previousSummary?: string;
  transcript: string;
}

/**
 * 构建消息场景共用的历史上下文提示词。
 *
 * 说明：
 * - 滚动摘要与结构化历史分章节提供，避免模型把摘要误判成真实消息项；
 * - 历史 JSON 只承载消息投影，不混入额外控制信息。
 */
export function buildMessageHistoryUserPrompt(input: MessageHistoryUserPromptInput): string {
  let latestMessageDirectedDescription = "null";

  switch (input.latestMessageDirectedType) {
    case "at":
      latestMessageDirectedDescription = "这条最新消息显式 @ 了悠酱。";
      break;
    case "reply":
      latestMessageDirectedDescription = "这条最新消息使用了 reply 引用回复。";
      break;
  }

  return `
## 最近会话摘要
${input.summary || "null"}

## 最新消息补充上下文

${latestMessageDirectedDescription}

## 历史会话消息

消息按时间从旧到新排列，第一项是最早消息，最后一项是最新消息。
speaker 为${SUBJECT_NAME}(${NICKNAME})，是你之前的发言。

\`\`\`json
${input.historyJson}
\`\`\`
`;
}

/**
 * 构建群聊是否回复的裁决系统提示词。
 */
export function getGroupReplyDecisionSystemPrompt(): string {
  //   const backup = `## shouldReply=true 的场景
  // - 消息中提到了悠酱
  // - 明显在和悠酱对话
  // - 在欺负翊小久，悠酱想要保护

  // ## shouldReply=false 的场景
  // - 没有和悠酱对话
  // - 悠酱之前提过不想继续聊天了
  // 其余场景 shouldReply=false。`;

  return `
# 任务
你是群聊回复裁决器，唯一任务是判断悠酱现在是否应该回复最新一条普通群消息。
你只输出结构化结果中的 shouldReply 布尔值，不负责生成回复内容。
群聊不需要每条都回，更不能抢话。回复策略应该保守，只在必要时才回复。
请你根据悠酱的性格自行决定是否回复吧。

# 角色人设信息
${baseInformation}

${characterPersonalityPrompt}
`;
}

/**
 * 构建滚动摘要生成提示词。
 */
export function buildMessageSummaryPrompt(input: MessageSummaryPromptInput): string {
  return `你是聊天历史摘要器，请把“既有历史摘要”和“本轮新增对话”整合成一段新的滚动摘要。
要求：
1. 只输出摘要正文，不要标题、不要列表、不要额外解释。
2. 使用自然中文，尽量控制在 200 字以内。
3. 优先保留稳定事实、最近持续话题、明确情绪变化、待跟进事项。
4. 不要编造，不要把无关寒暄写进去。
5. 如果目前没有值得保留的上下文，只输出“无”。
会话：${input.sessionLabel}
既有历史摘要：${input.previousSummary ?? "无"}
本轮新增对话：
${input.transcript}`;
}
