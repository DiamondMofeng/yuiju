import { tool } from "ai";
import { z } from "zod";
import { getPersonMemory, listPersonMemories } from "../../memory";

export const listPersonMemoriesTool = tool({
  description:
    "分页列出当前已经存在人物记忆文件的人物目录。结果按用户发言热度从高到低排序，需要更多结果时继续传入下一页 page。",
  inputSchema: z.object({
    page: z.number().int().min(1).optional().describe("页码，从 1 开始。"),
  }),
  execute: async ({ page }) => {
    const result = await listPersonMemories(page);
    return result;
  },
});

export const getPersonMemoryTool = tool({
  description: "按 personId 读取对应人物记忆对象。",
  inputSchema: z.object({
    personId: z.string().min(1).describe("人物稳定标识，第一版直接使用 QQ 号。"),
  }),
  execute: async ({ personId }) => {
    const result = await getPersonMemory(personId);
    return result;
  },
});
