import type { Tool } from "ai";
import { z } from "zod";
import { logger } from "../../logger";
import { searchDiaries, searchEpisodes } from "../../memory";

const limitField = z.number().int().min(1).max(20).optional().describe("返回结果上限，默认 5。");

const todayEventSearchInputSchema = z.strictObject({
  limit: limitField,
  timeSort: z.enum(["asc", "desc"]).optional().describe("asc 为按时间正序，desc 为按时间倒序。"),
});

const diarySearchInputSchema = z.strictObject({
  limit: limitField,
  startDate: z.string().optional().describe("开始日期，格式 YYYY-MM-DD。"),
  endDate: z.string().optional().describe("结束日期，格式 YYYY-MM-DD。"),
});

export const todayEventSearchTool: Tool = {
  description: "查询今天发生过的事",
  inputSchema: todayEventSearchInputSchema,
  execute: async (input) => {
    const result = await searchEpisodes({
      topK: input.limit,
      timeSort: input.timeSort ?? "desc",
    });
    logger.debug("[工具调用][todayEventSearch]", input, result);
    return result;
  },
};

export const diarySearchTool: Tool = {
  description:
    "查询昨天及更早的日记。可按自然日范围筛选；不用于今天的事件查询，也不用于长期事实查询。",
  inputSchema: diarySearchInputSchema,
  execute: async (input) => {
    const result = await searchDiaries({
      topK: input.limit,
      startTime: input.startDate ? `${input.startDate} 00:00:00` : undefined,
      endTime: input.endDate ? `${input.endDate} 23:59:59` : undefined,
    });
    logger.debug("[工具调用][diarySearch]", input, result);
    return result;
  },
};
