import Redis from "ioredis";
import { getYuijuConfig } from "../config";

let redis: Redis | null = null;
let syncRedis: Redis | null = null;

export type RedisHashFields = Record<string, string | number | Buffer>;

export type SyncRedisStateWrite =
  | {
      command: "hset";
      key: string;
      fields: RedisHashFields;
    }
  | {
      command: "set";
      key: string;
      value: string;
    };

export const getRedis = () => {
  if (!redis) {
    const redisUrl = getYuijuConfig().database.redisUrl.trim();
    redis = new Redis(redisUrl);
  }
  return redis;
};

const getSyncRedis = () => {
  const syncRedisUrl = getYuijuConfig().database.syncRedisUrl?.trim();
  if (!syncRedisUrl) {
    return null;
  }

  if (!syncRedis) {
    syncRedis = new Redis(syncRedisUrl);
  }
  return syncRedis;
};

export const closeRedis = async () => {
  if (redis) {
    await redis.quit();
    redis = null;
  }

  if (syncRedis) {
    await syncRedis.quit();
    syncRedis = null;
  }
};

export const syncRedisStateWrite = async (write: SyncRedisStateWrite): Promise<void> => {
  try {
    const redis = getSyncRedis();
    if (!redis) {
      return;
    }

    if (write.command === "hset") {
      await redis.hset(write.key, write.fields);
      return;
    }

    await redis.set(write.key, write.value);
  } catch (error) {
    console.error(`Sync Redis write failed: ${write.key}`, error);
  }
};
