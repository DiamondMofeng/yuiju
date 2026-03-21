import type { Tool } from "ai";
import { z } from "zod";
import { memoryQueryRouter } from "../../memory";

export const memorySearchTool: Tool = {
  description:
    "统一记忆查询入口。必须显式选择记忆类型：episode 用于查过去事件，fact 用于查长期事实/偏好/关系，plan 用于查当前计划。优先填写精确时间范围 startTime / endTime（YYYY-MM-DD HH:mm:ss）；只有在不方便给出精确时间时，才使用 timeRange 快捷时间。",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "具体的搜索内容。如果你要搜索自己的记忆，请使用你的日文名（ゆいじゅ）。例如：ゆいじゅ喜欢草莓吗？",
      ),
    memoryType: z
      .enum(["episode", "fact", "plan"])
      .describe("查询模式，必须显式指定：episode 查事件经过，fact 查长期事实，plan 查当前计划。"),
    timeRange: z
      .enum(["today", "yesterday", "day_before_yesterday"])
      .optional()
      .describe(
        "快捷时间筛选，仅支持 today（今天）、yesterday（昨天）、day_before_yesterday（前天）。",
      ),
    startTime: z
      .string()
      .optional()
      .describe("精确开始时间，格式必须为 YYYY-MM-DD HH:mm:ss。若填写，则优先于 timeRange。"),
    endTime: z
      .string()
      .optional()
      .describe("精确结束时间，格式必须为 YYYY-MM-DD HH:mm:ss。若填写，则优先于 timeRange。"),
    timeSort: z
      .enum(["asc", "desc"])
      .default("desc")
      .describe("结果时间排序方向：asc 为按时间正序，desc 为按时间倒序。"),
    counterpartyName: z
      .string()
      .optional()
      .describe("可选，对特定对象进行过滤，例如某位聊天对象或关系主体。"),
    topK: z.number().int().min(1).max(20).optional().describe("返回结果上限，默认 5。"),
  }),
  execute: async ({
    query,
    memoryType,
    timeRange,
    startTime,
    endTime,
    timeSort,
    counterpartyName,
    topK,
  }) => {
    return await memoryQueryRouter.search({
      query,
      memoryType,
      timeRange,
      startTime,
      endTime,
      timeSort,
      counterpartyName,
      topK,
    });
  },
};
