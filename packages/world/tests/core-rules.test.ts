import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { resolveDiaryDateForSleep } from "../src/memory/diary/generator";
import { buildFoodMetadata, resolveFoodRecoveryPerUnit } from "../src/utils/food-utils";

describe("resolveDiaryDateForSleep", () => {
  it("maps sleep before 06:00 to previous diary day", () => {
    const result = resolveDiaryDateForSleep(new Date("2026-04-19T01:30:00+08:00"));
    expect(dayjs(result).format("YYYY-MM-DD")).toBe("2026-04-18");
    expect(dayjs(result).hour()).toBe(0);
  });

  it("keeps same day for sleep at or after 06:00", () => {
    const result = resolveDiaryDateForSleep(new Date("2026-04-19T22:15:00+08:00"));
    expect(dayjs(result).format("YYYY-MM-DD")).toBe("2026-04-19");
    expect(dayjs(result).hour()).toBe(0);
  });
});

describe("food metadata helpers", () => {
  it("uses fallback satiety when satiety is absent", () => {
    const metadata = buildFoodMetadata({
      stamina: 6,
      fallbackSatiety: 14,
      mood: 2,
    });

    expect(metadata).toEqual({
      stamina: 6,
      satiety: 14,
      mood: 2,
    });
  });

  it("applies compatibility defaults when metadata is missing", () => {
    expect(resolveFoodRecoveryPerUnit()).toEqual({
      stamina: 10,
      satiety: 20,
      mood: 0,
    });
  });
});
