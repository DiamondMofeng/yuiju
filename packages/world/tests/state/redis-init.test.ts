import { describe, expect, it, vi } from "vitest";
import { ActionId } from "@yuiju/utils";

describe("Redis 状态初始化/格式化", () => {
  it("initCharacterStateData：Redis 为空时写入默认值并返回默认状态", async () => {
    process.env.NODE_ENV = "development";

    const redisInstance = {
      hgetall: vi.fn(async () => ({})),
      hset: vi.fn(async () => 1),
      hget: vi.fn(async () => null),
      quit: vi.fn(async () => undefined),
    };

    vi.resetModules();
    vi.doMock("ioredis", () => {
      return {
        default: function MockRedis() {
          return redisInstance as any;
        },
      };
    });

    const { initCharacterStateData } = await import("../../../utils/src/redis");
    const { ActionId, MajorScene } = await import("../../../utils/src/types");
    const data = await initCharacterStateData();

    expect(data).toEqual({
      action: ActionId.Idle,
      location: { major: MajorScene.Home },
      stamina: 100,
      satiety: 70,
      mood: 60,
      money: 0,
      dailyActionsDoneToday: [],
      inventory: [],
      runningAction: null,
    });

    expect(redisInstance.hset).toHaveBeenCalledTimes(1);
  });

  it("initCharacterStateData：坏数据时做兜底与过滤", async () => {
    process.env.NODE_ENV = "development";

    const redisInstance = {
      hgetall: vi.fn(async () => ({
        action: "not_action",
        location: "{bad json",
        stamina: "not_a_number",
        money: "5",
        dailyActionsDoneToday: JSON.stringify(["发呆", "not_action"]),
        inventory: "{bad json",
      })),
      hset: vi.fn(async () => 1),
      hget: vi.fn(async () => null),
      quit: vi.fn(async () => undefined),
    };

    vi.resetModules();
    vi.doMock("ioredis", () => {
      return {
        default: function MockRedis() {
          return redisInstance as any;
        },
      };
    });

    const { initCharacterStateData } = await import("../../../utils/src/redis");
    const { ActionId, MajorScene } = await import("../../../utils/src/types");
    const data = await initCharacterStateData();

    expect(data.action).toBe(ActionId.Idle);
    expect(data.location).toEqual({ major: MajorScene.Home });
    expect(data.stamina).toBe(100);
    expect(data.satiety).toBe(70);
    expect(data.mood).toBe(60);
    expect(data.money).toBe(5);
    expect(data.dailyActionsDoneToday).toEqual([ActionId.Idle]);
    expect(data.inventory).toEqual([]);
    expect(data.runningAction).toBeNull();

    expect(redisInstance.hset).not.toHaveBeenCalled();
  });

  it("initWorldStateData：time 缺失时写回并返回当前时间", async () => {
    process.env.NODE_ENV = "development";

    const redisInstance = {
      hgetall: vi.fn(async () => ({})),
      hset: vi.fn(async () => 1),
      hget: vi.fn(async () => null),
      quit: vi.fn(async () => undefined),
    };

    vi.resetModules();
    vi.doMock("ioredis", () => {
      return {
        default: function MockRedis() {
          return redisInstance as any;
        },
      };
    });

    const { initWorldStateData } = await import("../../../utils/src/redis");
    const data = await initWorldStateData();

    expect(typeof data.time.toISOString).toBe("function");
    expect(redisInstance.hset).toHaveBeenCalledTimes(1);
  });

  it("initWorldStateData：time 非法时回退并写回", async () => {
    process.env.NODE_ENV = "development";

    const redisInstance = {
      hgetall: vi.fn(async () => ({})),
      hset: vi.fn(async () => 1),
      hget: vi.fn(async () => "not-a-date"),
      quit: vi.fn(async () => undefined),
    };

    vi.resetModules();
    vi.doMock("ioredis", () => {
      return {
        default: function MockRedis() {
          return redisInstance as any;
        },
      };
    });

    const { initWorldStateData } = await import("../../../utils/src/redis");
    const data = await initWorldStateData();

    expect(typeof data.time.toISOString).toBe("function");
    expect(redisInstance.hset).toHaveBeenCalledTimes(1);
  });

  it("initCharacterStateData：runningAction 坏数据时回退为 null", async () => {
    process.env.NODE_ENV = "development";

    const redisInstance = {
      hgetall: vi.fn(async () => ({
        action: ActionId.Sleep,
        runningAction: JSON.stringify({
          action: "not_action",
          actionStartedAt: "not-a-date",
          actionDurationMinutes: "30",
          waitUntil: "not-a-date",
        }),
      })),
      hset: vi.fn(async () => 1),
      hget: vi.fn(async () => null),
      quit: vi.fn(async () => undefined),
    };

    vi.resetModules();
    vi.doMock("ioredis", () => {
      return {
        default: function MockRedis() {
          return redisInstance as any;
        },
      };
    });

    const { initCharacterStateData } = await import("../../../utils/src/redis");
    const data = await initCharacterStateData();

    expect(data.action).toBe(ActionId.Sleep);
    expect(data.runningAction).toBeNull();
  });
});
