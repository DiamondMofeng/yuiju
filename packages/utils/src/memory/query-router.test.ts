import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRecentMemoryEpisodesMock = vi.fn();
const initPlanStateDataMock = vi.fn();
const getMemoryServiceClientFromEnvMock = vi.fn();

vi.mock("../db", () => ({
  getRecentMemoryEpisodes: getRecentMemoryEpisodesMock,
}));

vi.mock("../env", () => ({
  isDev: () => false,
}));

vi.mock("../redis", () => ({
  initPlanStateData: initPlanStateDataMock,
}));

vi.mock("./memory-service-client", () => ({
  getMemoryServiceClientFromEnv: getMemoryServiceClientFromEnvMock,
}));

vi.mock("./rerank", () => ({
  rerankEpisodesWithSiliconFlow: vi.fn(),
}));

function createEpisodeDoc(input: { id: string; summaryText: string; happenedAt: string }) {
  return {
    _id: input.id,
    summaryText: input.summaryText,
    happenedAt: new Date(input.happenedAt),
    payload: {},
    type: "conversation",
    source: "chat",
  };
}

describe("query-router", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T09:00:00+08:00"));
    getRecentMemoryEpisodesMock.mockReset();
    initPlanStateDataMock.mockReset();
    getMemoryServiceClientFromEnvMock.mockReset();
    initPlanStateDataMock.mockResolvedValue({
      mainPlan: null,
      activePlans: [],
    });
    getMemoryServiceClientFromEnvMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("精确时间优先于快捷时间，并将时间正序传递到底层查询", async () => {
    getRecentMemoryEpisodesMock.mockResolvedValueOnce([]);

    const { searchEpisodes } = await import("./query-router");
    await searchEpisodes({
      query: "散步",
      memoryType: "episode",
      timeRange: "today",
      startTime: "2026-03-15 08:00:00",
      endTime: "2026-03-16 21:30:00",
      timeSort: "asc",
    });

    expect(getRecentMemoryEpisodesMock).toHaveBeenCalledTimes(1);
    const options = getRecentMemoryEpisodesMock.mock.calls[0][0];

    expect(options.sortDirection).toBe("asc");
    expect(options.onlyDate).toBeUndefined();
    expect(dayjs(options.happenedAfter).format("YYYY-MM-DD HH:mm:ss")).toBe("2026-03-15 08:00:00");
    expect(dayjs(options.happenedBefore).format("YYYY-MM-DD HH:mm:ss")).toBe("2026-03-16 21:30:00");
  });

  it("非法精确时间会被忽略，并回退到快捷时间过滤", async () => {
    getRecentMemoryEpisodesMock.mockResolvedValueOnce([]);

    const { searchEpisodes } = await import("./query-router");
    await searchEpisodes({
      query: "散步",
      memoryType: "episode",
      timeRange: "yesterday",
      startTime: "not-a-time",
      timeSort: "desc",
    });

    expect(getRecentMemoryEpisodesMock).toHaveBeenCalledTimes(1);
    const options = getRecentMemoryEpisodesMock.mock.calls[0][0];

    expect(options.happenedAfter).toBeUndefined();
    expect(options.happenedBefore).toBeUndefined();
    expect(dayjs(options.onlyDate).format("YYYY-MM-DD")).toBe("2026-03-17");
  });

  it("同分数 Episode 会按 timeSort 升序排序", async () => {
    getRecentMemoryEpisodesMock.mockResolvedValueOnce([
      createEpisodeDoc({
        id: "later",
        summaryText: "和小久一起散步",
        happenedAt: "2026-03-16T18:00:00+08:00",
      }),
      createEpisodeDoc({
        id: "earlier",
        summaryText: "和小久一起散步",
        happenedAt: "2026-03-15T09:00:00+08:00",
      }),
    ]);

    const { searchEpisodes } = await import("./query-router");
    const results = await searchEpisodes({
      query: "散步",
      memoryType: "episode",
      timeSort: "asc",
    });

    expect(results.map((item) => item.evidenceIds[0])).toEqual(["earlier", "later"]);
  });

  it("同分数 Episode 会按 timeSort 倒序排序", async () => {
    getRecentMemoryEpisodesMock.mockResolvedValueOnce([
      createEpisodeDoc({
        id: "earlier",
        summaryText: "和小久一起散步",
        happenedAt: "2026-03-15T09:00:00+08:00",
      }),
      createEpisodeDoc({
        id: "later",
        summaryText: "和小久一起散步",
        happenedAt: "2026-03-16T18:00:00+08:00",
      }),
    ]);

    const { searchEpisodes } = await import("./query-router");
    const results = await searchEpisodes({
      query: "散步",
      memoryType: "episode",
      timeSort: "desc",
    });

    expect(results.map((item) => item.evidenceIds[0])).toEqual(["later", "earlier"]);
  });
});
