import { tool } from "ai";
import { z } from "zod";
import { logger } from "../../logger";
import { getPersonMemory, listPersonMemories } from "../../memory";

export const listPersonMemoriesTool = tool({
  description: "列出当前已经存在人物记忆文件的人物目录。",
  inputSchema: z.object({}),
  execute: async () => {
    const items = await listPersonMemories();
    logger.debug("[工具调用]", "listPersonMemories", {
      count: items.length,
    });

    return items;
  },
});

export const getPersonMemoryTool = tool({
  description: "按 personId 读取对应人物记忆对象。",
  inputSchema: z.object({
    personId: z.string().min(1).describe("人物稳定标识，第一版直接使用 QQ 号。"),
  }),
  execute: async ({ personId }) => {
    const result = await getPersonMemory(personId);
    logger.debug("[工具调用]", "getPersonMemory", {
      personId,
      found: Boolean(result),
    });

    return result;
  },
});
