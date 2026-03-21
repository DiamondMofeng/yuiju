import { beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";

/**
 * Unit tests should not require real Redis/Mongo instances.
 *
 * - Redis: mock `ioredis` with a tiny in-memory implementation.
 * - Mongo: code paths can opt-out via `YUIJU_DISABLE_MONGO=1` (set here).
 */
process.env.YUIJU_DISABLE_MONGO = "1";

type RedisValue = string | Map<string, string>;

const redisData = new Map<string, RedisValue>();

class MockRedis extends EventEmitter {
  // ioredis constructor accepts many overloads; tests only need URL string support.
  constructor(_url?: string) {
    super();
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const value = redisData.get(key);
    if (!(value instanceof Map)) {
      return {};
    }
    return Object.fromEntries(value.entries());
  }

  async hget(key: string, field: string): Promise<string | null> {
    const value = redisData.get(key);
    if (!(value instanceof Map)) {
      return null;
    }
    return value.get(field) ?? null;
  }

  async hset(
    key: string,
    fieldOrMap: string | Record<string, unknown>,
    maybeValue?: unknown,
  ): Promise<number> {
    let value = redisData.get(key);
    if (!(value instanceof Map)) {
      value = new Map<string, string>();
      redisData.set(key, value);
    }

    const hash = value as Map<string, string>;
    if (typeof fieldOrMap === "string") {
      hash.set(fieldOrMap, String(maybeValue ?? ""));
      return 1;
    }

    for (const [field, fieldValue] of Object.entries(fieldOrMap ?? {})) {
      hash.set(field, String(fieldValue));
    }
    return Object.keys(fieldOrMap ?? {}).length;
  }

  async get(key: string): Promise<string | null> {
    const value = redisData.get(key);
    return typeof value === "string" ? value : null;
  }

  async set(key: string, value: unknown): Promise<"OK"> {
    redisData.set(key, String(value));
    return "OK";
  }

  async quit(): Promise<"OK"> {
    return "OK";
  }

  disconnect(): void {
    // no-op
  }
}

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

beforeEach(() => {
  redisData.clear();
});
