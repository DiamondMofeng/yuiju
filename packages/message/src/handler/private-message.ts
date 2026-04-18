import "@yuiju/utils/env";
import { getYuijuConfig } from "@yuiju/utils";
import type { AllHandlers, NCWebsocket } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { logger } from "@/utils/logger";
import { createStoredPrivateMessage, getProtocolMessageSenderName } from "@/utils/message";
import { sendAndRecordPrivateReply } from "@/utils/reply";
import { closeGroupMessage, openGroupMessage } from "./group-message";

const config = getYuijuConfig();
const whiteList = config.message.whiteList;

function groupMessageAction(action: string | null) {
  if (action === "/关闭") {
    closeGroupMessage();
    return true;
  }
  if (action === "/开启") {
    openGroupMessage();
    return true;
  }
  return false;
}

export async function privateMessageHandler(
  context: AllHandlers["message.private"],
  napcat: NCWebsocket,
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

  try {
    const { quick_action: _quickAction, ...rawMessage } = context;
    const storedMessage = await createStoredPrivateMessage(rawMessage, napcat);
    const sessionLabel = getProtocolMessageSenderName(storedMessage);

    logger.info("[message.receive.private] 收到私聊消息", {
      sender: sessionLabel,
      rawMessage: storedMessage.raw_message,
    });

    llmManager.recordPrivateMessage(storedMessage, sessionLabel);
    const { text } = await llmManager.chatWithLLM(storedMessage);

    const reply = (text || "").trim();
    if (!reply || reply === "null") {
      return;
    }

    await sendAndRecordPrivateReply({
      napcat,
      userId: context.user_id,
      reply,
      sessionLabel,
    });
  } catch (error) {
    logger.error("[message.reply.private] 处理私聊消息失败", error);
  }
}
