import { saveMemoryEpisode } from "../db";
import type { MemoryEpisodeWriteInput } from "./episode";

/**
 * 统一 Episode 写入入口。
 *
 * 说明：
 * - 主链路只负责先写 Mongo 作为事件真相源；
 * - 不再附带长期记忆抽取相关状态字段。
 */
export async function emitMemoryEpisode(episode: MemoryEpisodeWriteInput): Promise<string | null> {
  const savedEpisode = await saveMemoryEpisode({
    ...episode,
  });

  return savedEpisode.id ?? null;
}
