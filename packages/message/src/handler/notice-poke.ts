import { ActionId, initCharacterStateData } from "@yuiju/utils";
import type { AllHandlers, NCWebsocket } from "node-napcat-ts";

/**
 * 处理“戳一戳”通知。
 *
 * 说明：
 * - 仅处理其他人对机器人的群内戳一戳；
 * - 如果是机器人自己触发，或不在群上下文中，则直接忽略；
 * - 当前策略为收到群内戳一戳后立即回戳对方。
 */
export async function noticePokeHandler(
  context: AllHandlers["notice.notify.poke"],
  napcat: NCWebsocket,
) {
  // 过滤掉发送人是自己的消息
  if (context.user_id === context.self_id) {
    return;
  }

  // 过滤掉目标用户不是自己的消息
  if (context.target_id !== context.self_id) {
    return;
  }

  // 睡觉时，不能发送消息
  const characterStateData = await initCharacterStateData();
  if (characterStateData.action === ActionId.Sleep) {
    return;
  }

  const groupId = "group_id" in context ? context.group_id : undefined;
  if (!groupId) {
    return;
  }

  await napcat.group_poke({
    group_id: groupId,
    user_id: context.user_id,
  });
}
