import { saveMemoryEpisode } from "../db";
import type { MemoryEpisodeWriteInput } from "./episode";

/**
 * 统一 Episode 写入入口。
 *
 * 说明：
 * - 主链路只负责先写 Mongo 作为事件真相源；
 * - 旧的长期记忆后处理链已经移除，写入时统一标记为 skipped；
 * - 这样既保留历史字段兼容性，也避免产生永远不会被处理的 pending 状态。
 */
export async function emitMemoryEpisode(episode: MemoryEpisodeWriteInput): Promise<string | null> {
  const savedEpisode = await saveMemoryEpisode({
    ...episode,
    extractionStatus: "skipped",
    extractedFactIds: [],
  });

  return savedEpisode.id ?? null;
}
