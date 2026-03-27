import "@yuiju/utils/env";
import { setTimeout } from "node:timers/promises";
import { ActionId, getYuijuConfig, initCharacterStateData } from "@yuiju/utils";
import { type AllHandlers, type NCWebsocket, Structs } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { parseGroupMessage } from "@/utils/group-message";
import { getReplyDelayMs } from "@/utils/message";

let isCloseGroup = false;
const config = getYuijuConfig();

export const closeGroupMessage = () => {
  isCloseGroup = true;
};

export const openGroupMessage = () => {
  isCloseGroup = false;
};

export async function groupMessageHandler(
  context: AllHandlers["message.group"],
  napcat: NCWebsocket,
) {
  // TODO: 临时逻辑，后续需要抽离
  if (isCloseGroup) {
    console.log("已关闭群消息");
    return;
  }

  if (!config.message.groupWhiteList.includes(context.group_id)) {
    return;
  }

  const parsedMessage = await parseGroupMessage(context, napcat);

  if (!parsedMessage.textForLLM) {
    return;
  }

  const timestamp = new Date(context.time * 1000);
  llmManager.recordGroupMessage({
    groupId: context.group_id,
    groupName: parsedMessage.groupDisplayName,
    senderName: parsedMessage.senderName,
    content: parsedMessage.textForLLM,
    timestamp,
    isAtBot: parsedMessage.isAtBot,
  });

  console.log(
    `收到群 ${parsedMessage.groupDisplayName}(${context.group_id}) 中 ${parsedMessage.senderName}(${context.sender.user_id}) 的消息: ${parsedMessage.textForLLM}`,
  );

  // TODO: 临时逻辑，后续需要抽离
  const characterStateData = await initCharacterStateData();
  if (characterStateData.action === ActionId.Sleep) {
    console.log("角色处于睡眠状态，不处理群消息");
    return;
  }

  try {
    const shouldReply = parsedMessage.isAtBot
      ? true
      : await shouldReplyToGroupMessage({
          context,
          groupName: parsedMessage.groupDisplayName,
          senderName: parsedMessage.senderName,
          content: parsedMessage.textForLLM,
        });

    if (!shouldReply) {
      return;
    }

    const { text } = await llmManager.chatInGroup({
      groupId: context.group_id,
      groupName: parsedMessage.groupDisplayName,
      senderName: parsedMessage.senderName,
      content: parsedMessage.textForLLM,
      timestamp,
      isAtBot: parsedMessage.isAtBot,
    });

    const reply = (text || "").trim() || "呜…这句话我一时没理解呢。";
    console.log(`回复群 ${parsedMessage.groupDisplayName}(${context.group_id}) 的消息: ${reply}`);

    if (parsedMessage.isAtBot) {
      context.quick_action([Structs.text(reply)]);
    } else {
      const replyList = reply.split("\n").filter(Boolean);
      for (const [index, item] of replyList.entries()) {
        await napcat.send_group_msg({
          group_id: context.group_id,
          message: [Structs.text(item)],
        });

        const nextReply = replyList[index + 1];
        if (nextReply) {
          await setTimeout(getReplyDelayMs(nextReply));
        }
      }
    }
  } catch (error) {
    console.log(error);
  }
}

/**
 * 普通群消息使用独立的小模型进行裁决，避免每条消息都直接拉起大模型回复。
 */
async function shouldReplyToGroupMessage(input: {
  context: AllHandlers["message.group"];
  groupName: string;
  senderName: string;
  content: string;
}) {
  const shouldReply = await llmManager.shouldReplyGroupMessage({
    groupId: input.context.group_id,
    groupName: input.groupName,
    senderName: input.senderName,
    content: input.content,
    timestamp: new Date(input.context.time * 1000),
    isAtBot: false,
  });

  console.log(
    `群 ${input.groupName}(${input.context.group_id}) 消息裁决结果: ${shouldReply ? "回复" : "跳过"}`,
  );

  return shouldReply;
}
