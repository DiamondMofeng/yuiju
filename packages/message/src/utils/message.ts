/**
 * 根据“下一条即将发送”的文本长度估算等待间隔，让消息节奏更接近真人组织下一句回复。
 *
 * 说明：
 * - 基础等待保证极短句也不会瞬间连发；
 * - 按字符数线性增加等待时间，使长句拥有更自然的停顿；
 * - 使用上下限避免回复过慢；
 * - 叠加轻微随机扰动，减少固定模板感。
 */
export function getReplyDelayMs(text: string): number {
  const baseDelayMs = 1000;
  const perCharacterDelayMs = 200;
  const minDelayMs = 400;
  const maxDelayMs = 10000;
  const randomJitterMs = (Math.random() - 0.5) * 360;
  const estimatedDelayMs = baseDelayMs + text.trim().length * perCharacterDelayMs;

  return Math.round(Math.min(maxDelayMs, Math.max(minDelayMs, estimatedDelayMs + randomJitterMs)));
}
