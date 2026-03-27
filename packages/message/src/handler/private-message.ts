import "@yuiju/utils/env";
import { setTimeout } from "node:timers/promises";
import { getYuijuConfig } from "@yuiju/utils";
import { type AllHandlers, type NCWebsocket, Structs } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { getReplyDelayMs } from "@/utils/message";
import { closeGroupMessage, openGroupMessage } from "./group-message";

const config = getYuijuConfig();
const whiteList = config.message.whiteList;

function groupMessageAction(action: string | null) {
  if (action === "/关闭") {
    closeGroupMessage();
    return true;
  }
  if (action === "/开放") {
    openGroupMessage();
    return true;
  }
  return false;
}

export async function privateMessageHandler(
  context: AllHandlers["message.private"],
  _napcat: NCWebsocket,
) {
  let receiveMessage: string | null = null;
  for (const item of context.message) {
    if (item.type === "text") {
      receiveMessage = item.data.text;
    }
  }

  if (groupMessageAction(receiveMessage)) {
    return;
  }

  if (!receiveMessage) {
    return;
  }

  if (!whiteList.includes(context.sender.user_id) && !context.sender.nickname) {
    return;
  }

  console.log(
    `收到来自 ${context.sender.nickname}(${context.sender.user_id}) 的消息: ${receiveMessage}`,
  );
  const userName = context.sender.nickname || String(context.sender.user_id);

  try {
    if (!config.llm.deepseekApiKey.trim()) {
      await context.quick_action([Structs.text("DeepSeek 未配置，稍后再试呢~")]);
      return;
    }

    const { text } = await llmManager.chatWithLLM(receiveMessage, userName);

    const reply = (text || "").trim() || "呜…这句话我一时没理解呢。";
    console.log(`回复给 ${context.sender.nickname}(${context.sender.user_id}) 的消息: ${reply}`);

    const replyList = reply.split("\n").filter(Boolean);
    for (const [index, item] of replyList.entries()) {
      await context.quick_action([Structs.text(item)]);

      const nextReply = replyList[index + 1];
      if (nextReply) {
        await setTimeout(getReplyDelayMs(nextReply));
      }
    }
  } catch (error) {
    console.log(error);
    await context.quick_action([Structs.text("小久刚刚摔了一跤，重试下呀~")]);
  }
}
