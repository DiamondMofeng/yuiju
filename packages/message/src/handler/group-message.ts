import { ActionId, getYuijuConfig, initCharacterStateData } from "@yuiju/utils";
import type { AllHandlers, NCWebsocket } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { logger } from "@/utils/logger";
import {
  createStoredGroupMessage,
  getGroupDisplayName,
  isGroupMessageDirectedToBot,
} from "@/utils/message";
import { sendAndRecordGroupReply } from "@/utils/reply";

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
    return;
  }

  if (!config.message.groupWhiteList.includes(context.group_id)) {
    return;
  }

  const { quick_action: _quickAction, ...storedContext } = context;
  if (!storedContext.message.length) {
    return;
  }
  const storedMessage = await createStoredGroupMessage(storedContext, napcat);
  const groupName = getGroupDisplayName(storedMessage);

  logger.info("[message.receive.group] 收到群消息", {
    groupName,
    sender: storedMessage.sender.card || storedMessage.sender.nickname || storedMessage.user_id,
    rawMessage: storedMessage.raw_message,
  });

  llmManager.recordGroupMessage(storedMessage, groupName);

  // 睡觉时，不能发送消息
  const characterStateData = await initCharacterStateData();
  if (characterStateData.action === ActionId.Sleep) {
    return;
  }

  try {
    const messageCheckResult = await isGroupMessageDirectedToBot(storedMessage, napcat);
    const shouldReply = await llmManager.shouldReplyGroupMessage(
      storedMessage,
      messageCheckResult.type,
    );

    if (!shouldReply) {
      return;
    }

    const groupChatResult = await llmManager.chatInGroup(storedMessage);
    if (groupChatResult.status === "cancelled") {
      logger.info("[message.reply.group] 群聊回复生成已取消，不发送消息", {
        groupId: context.group_id,
        groupName,
        requestId: storedMessage.message_id,
      });
      return;
    }

    if (!llmManager.isLatestGroupChatRequest(context.group_id, groupChatResult.requestId)) {
      logger.info("[message.reply.group] 群聊回复结果已过期，不发送消息", {
        groupId: context.group_id,
        groupName,
        requestId: groupChatResult.requestId,
      });
      return;
    }

    const reply = (groupChatResult.text || "").trim();
    if (!reply || reply === "null") {
      return;
    }

    await sendAndRecordGroupReply({
      napcat,
      groupId: context.group_id,
      sourceMessageId: context.message_id,
      reply,
      sessionLabel: groupName,
      shouldReplyToSourceMessage: messageCheckResult.isDriectedToBot,
    });
  } catch (error) {
    logger.error("[message.reply.group] 处理群消息失败", error);
  }
}
