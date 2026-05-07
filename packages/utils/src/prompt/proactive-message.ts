import type { ActionId, CharacterStateData, WorldStateData } from "../types";

export interface BuildProactiveGroupMessagePromptInput {
  action: ActionId;
  shareReason: string;
  eventDescription?: string;
  completionContext?: Record<string, unknown>;
  characterStateSnapshot: CharacterStateData;
  worldStateSnapshot: WorldStateData;
  groupContext: {
    groupLabel: string;
    summary?: string;
    historyJson: string;
  };
}

export function buildProactiveGroupMessagePrompt(
  input: BuildProactiveGroupMessagePromptInput,
): string {
  return `
## 主动分享任务

你在行动决策时已经产生了想分享生活事件的意图。你现在只需要根据目标群聊上下文，判断此刻是否适合把这件事发到群里，并生成最终群消息。

## 分享意图

${input.shareReason}

## Action 完成事实

Action：${input.action}
事件描述：${input.eventDescription ?? "无"}
完成上下文：
\`\`\`json
${JSON.stringify(input.completionContext ?? {}, null, 2)}
\`\`\`

## 当前角色状态

\`\`\`json
${JSON.stringify(input.characterStateSnapshot, null, 2)}
\`\`\`

## 当前世界状态

\`\`\`json
${JSON.stringify(input.worldStateSnapshot, null, 2)}
\`\`\`

## 目标群聊

群聊：${input.groupContext.groupLabel}

最近群聊摘要：
${input.groupContext.summary ?? "无"}

最近群聊消息：
\`\`\`json
${input.groupContext.historyJson}
\`\`\`

## 判断要求

- 只判断当前群聊上下文是否适合插入这条生活分享，不要重新判断你是否想分享。
- 如果群聊正在聊完全无关且插入会突兀，shouldSend=false。
- 如果群聊安静，且这件生活事件本身适合自然分享，可以 shouldSend=true。
- 消息要像你自然分享生活，不要像系统通知。
- 不要提到 Action、completionEvent、触发记录、内部接口等实现概念。
- shouldSend=false 时 message 输出空字符串。
`.trim();
}
