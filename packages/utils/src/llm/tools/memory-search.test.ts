import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const searchMock = vi.fn();

vi.mock("../../memory", () => ({
  memoryQueryRouter: {
    search: searchMock,
  },
}));

describe("memorySearchTool", () => {
  it("使用新契约调用 query router", async () => {
    searchMock.mockResolvedValueOnce([
      {
        source: "fact",
        score: 1,
        summary: "悠酱喜欢草莓牛奶",
        evidenceIds: ["episode_1"],
        metadata: {
          source: "graphiti",
        },
      },
    ]);

    const { memorySearchTool } = await import("./memory-search");
    const result = await (memorySearchTool.execute as (...args: unknown[]) => Promise<unknown>)(
      {
        query: "悠酱喜欢什么",
        memoryType: "fact",
        timeRange: "yesterday",
        startTime: "2026-03-17 00:00:00",
        endTime: "2026-03-17 23:59:59",
        timeSort: "asc",
        counterpartyName: "小久",
        topK: 3,
      },
      {},
    );

    expect(searchMock).toHaveBeenCalledWith({
      query: "悠酱喜欢什么",
      memoryType: "fact",
      timeRange: "yesterday",
      startTime: "2026-03-17 00:00:00",
      endTime: "2026-03-17 23:59:59",
      timeSort: "asc",
      counterpartyName: "小久",
      topK: 3,
    });
    expect(result).toEqual([
      expect.objectContaining({
        evidenceIds: ["episode_1"],
        metadata: {
          source: "graphiti",
        },
      }),
    ]);
  });

  it("要求必须显式传入 memoryType", async () => {
    const { memorySearchTool } = await import("./memory-search");
    const inputSchema = memorySearchTool.inputSchema as z.ZodType;
    const parseResult = inputSchema.safeParse({
      query: "悠酱喜欢什么",
    });

    expect(parseResult.success).toBe(false);
  });
});
