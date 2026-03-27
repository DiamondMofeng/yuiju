import mongoose from "mongoose";
import { getYuijuConfig } from "../config";

declare global {
  // eslint-disable-next-line no-var
  var __yuiju_mongo_connection: Promise<typeof mongoose> | null | undefined;
}

export const connectDB = async () => {
  if (globalThis.__yuiju_mongo_connection) {
    return globalThis.__yuiju_mongo_connection;
  }

  const uri = getYuijuConfig().database.mongoUri.trim();
  if (!uri) {
    throw new Error("yuiju.config.ts 中的 database.mongoUri 未配置");
  }

  const connectionPromise = mongoose.connect(uri);
  globalThis.__yuiju_mongo_connection = connectionPromise;
  return connectionPromise;
};
