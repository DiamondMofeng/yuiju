import { tool } from "ai";
import { z } from "zod";
import { worldMapDsl } from "../../prompt/world-map";

/**
 * 查询星见町的世界地图。
 *
 * 返回世界地图 DSL，供 LLM 在需要时自行推导：
 * - 地点相对方位
 * - 两地之间的直接移动耗时与消耗
 * - 是否存在中间节点（如家 -> 公园 -> 神社）
 */
export const queryWorldMapTool = tool({
  description: "查询星见町的世界地图，返回可供推导地点关系、路径、方向与移动耗时的地图 DSL。",
  inputSchema: z.object({}),
  execute: async () => {
    console.log("[工具调用]", "queryWorldMap");
    return {
      dsl: worldMapDsl,
    };
  },
});
