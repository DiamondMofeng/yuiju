import "@yuiju/utils/env";

import {
  TEMPERATURE_LEVELS,
  type TemperatureLevel,
  WEATHER_TYPES,
  type WeatherSnapshot,
  type WeatherType,
} from "@yuiju/utils";
import dayjs from "dayjs";
import {
  generateWeatherSnapshot,
  resolveWeatherPeriod,
  type WeatherPeriod,
} from "@/engine/weather";

interface DemoWindow {
  label: string;
  startAt: string;
  periodCount: number;
}

interface WeatherTimelineItem {
  period: WeatherPeriod;
  snapshot: WeatherSnapshot;
}

interface WeatherStats {
  weatherTypeCounts: Record<WeatherType, number>;
  temperatureLevelCounts: Record<TemperatureLevel, number>;
}

const DEMO_WINDOWS: DemoWindow[] = [
  {
    label: "春季连续 7 天",
    startAt: "2026-03-01T00:00:00+08:00",
    periodCount: 28,
  },
  {
    label: "夏季连续 7 天",
    startAt: "2026-07-01T00:00:00+08:00",
    periodCount: 28,
  },
  {
    label: "秋季连续 7 天",
    startAt: "2026-10-01T00:00:00+08:00",
    periodCount: 28,
  },
  {
    label: "冬季连续 7 天",
    startAt: "2026-12-20T00:00:00+08:00",
    periodCount: 28,
  },
];

const ANNUAL_PREVIEW_START_AT = "2026-01-01T00:00:00+08:00";
const ANNUAL_PREVIEW_PERIOD_COUNT = 365 * 4;

/**
 * 生成一段连续天气时间线。
 *
 * 说明：
 * - 每个时间片都把上一片天气作为输入，模拟真实运行时的连续演化；
 * - updatedAt 直接复用时间片开始时间，避免把“当前执行时刻”混进展示结果里。
 */
function buildWeatherTimeline(input: DemoWindow): WeatherTimelineItem[] {
  const timeline: WeatherTimelineItem[] = [];
  let cursor = dayjs(input.startAt);
  let previousWeather: WeatherSnapshot | null = null;

  for (let index = 0; index < input.periodCount; index += 1) {
    const period = resolveWeatherPeriod(cursor);
    const snapshot = generateWeatherSnapshot({
      period,
      previousWeather,
      updatedAt: period.startAt.toISOString(),
    });

    timeline.push({
      period,
      snapshot,
    });

    previousWeather = snapshot;
    cursor = period.endAt;
  }

  return timeline;
}

/**
 * 统计天气类型和体感温度的出现次数。
 *
 * 说明：
 * - 这里只做最基础的频次统计，目标是让季节倾向一眼可读；
 * - 如果后续需要更细的分析，可以在这里继续扩展转移矩阵或按月统计。
 */
function summarizeWeatherTimeline(timeline: WeatherTimelineItem[]): WeatherStats {
  const weatherTypeCounts = createCountMap(WEATHER_TYPES);
  const temperatureLevelCounts = createCountMap(TEMPERATURE_LEVELS);

  for (const item of timeline) {
    weatherTypeCounts[item.snapshot.type] += 1;
    temperatureLevelCounts[item.snapshot.temperatureLevel] += 1;
  }

  return {
    weatherTypeCounts,
    temperatureLevelCounts,
  };
}

/**
 * 基于枚举值初始化计数字典。
 *
 * 说明：
 * - demo 统计直接复用类型枚举，避免后续扩展天气/体感时漏改展示层；
 * - 这里返回 Record，便于后续直接做累加与格式化输出。
 */
function createCountMap<TValue extends string>(items: readonly TValue[]): Record<TValue, number> {
  return Object.fromEntries(items.map((item) => [item, 0])) as Record<TValue, number>;
}

/**
 * 把时间线打印成便于人工观察的文本。
 */
function printWeatherTimeline(label: string, timeline: WeatherTimelineItem[]): void {
  console.log(`\n=== ${label} ===\n`);

  for (const item of timeline) {
    const periodText = `${item.period.startAt.format("MM-DD HH:mm")} -> ${item.period.endAt.format("MM-DD HH:mm")}`;
    const weatherText = `${item.snapshot.type} / ${item.snapshot.temperatureLevel}`;

    console.log(`${periodText} | ${weatherText}`);
  }

  const stats = summarizeWeatherTimeline(timeline);
  console.log("\n天气统计：", formatCountMap(stats.weatherTypeCounts));
  console.log("体感统计：", formatCountMap(stats.temperatureLevelCounts));
}

/**
 * 把计数字典格式化成紧凑输出。
 */
function formatCountMap(record: Record<string, number>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}:${value}`)
    .join(" | ");
}

/**
 * 打印全年概览，方便快速观察季节分布是否符合预期。
 */
function printAnnualPreview(): void {
  const timeline = buildWeatherTimeline({
    label: "全年概览",
    startAt: ANNUAL_PREVIEW_START_AT,
    periodCount: ANNUAL_PREVIEW_PERIOD_COUNT,
  });
  const groupedByMonth = new Map<string, WeatherTimelineItem[]>();

  for (const item of timeline) {
    const monthKey = item.period.startAt.format("YYYY-MM");
    const items = groupedByMonth.get(monthKey) ?? [];
    items.push(item);
    groupedByMonth.set(monthKey, items);
  }

  console.log("\n=== 全年月份概览 ===\n");

  for (const [monthKey, items] of groupedByMonth) {
    const stats = summarizeWeatherTimeline(items);
    console.log(
      `${monthKey} | 天气 ${formatCountMap(stats.weatherTypeCounts)} | 体感 ${formatCountMap(stats.temperatureLevelCounts)}`,
    );
  }
}

export async function main() {
  console.log("\n=== WEATHER GENERATION DEMO ===");
  console.log("说明：以下结果直接来自 generateWeatherSnapshot，用于人工观察天气生成效果。");

  for (const window of DEMO_WINDOWS) {
    const timeline = buildWeatherTimeline(window);
    printWeatherTimeline(window.label, timeline);
  }

  printAnnualPreview();
}
