import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const currentDir = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProd ? "info" : "debug");
const splatSymbol = Symbol.for("splat");

export interface CreateYuijuLoggerOptions {
  logDir?: string;
}

/**
 * 控制台与文件共用的文本格式。
 *
 * 说明：
 * - 统一把 message、splat 和 metadata 展平成可读文本；
 * - 兼容 Error、对象和普通字符串，避免日志出现 `[object Object]`。
 */
const textFormat = winston.format.printf((info: winston.Logform.TransformableInfo) => {
  const splat =
    ((info as Record<PropertyKey, unknown>)[splatSymbol] as unknown[] | undefined) || [];
  const metaCopy = info.metadata ? { ...(info.metadata as Record<string, unknown>) } : {};

  if (splat.length) {
    for (const arg of splat) {
      if (typeof arg === "object" && arg !== null) {
        for (const key of Object.keys(arg)) {
          if (metaCopy[key] === (arg as Record<string, unknown>)[key]) {
            delete metaCopy[key];
          }
        }
      }
    }
  }

  const stringify = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }
    if (value === undefined) {
      return "";
    }
    if (value instanceof Error) {
      return value.stack || value.message || String(value);
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const message = stringify(info.message);
  const splatText = splat.map(stringify).join(" ");
  const metaText = Object.keys(metaCopy).length ? JSON.stringify(metaCopy) : "";

  return [`[${info.timestamp}]`, `[${info.level}]`, message, splatText, metaText]
    .filter(Boolean)
    .join(" ");
});

function buildConsoleFormat() {
  const { format } = winston;

  return format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata({ fillExcept: ["message", "level", "timestamp"] }),
    format.colorize(),
    textFormat,
  );
}

function buildFileFormat() {
  const { format } = winston;

  return format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata({ fillExcept: ["message", "level", "timestamp"] }),
    textFormat,
  );
}

/**
 * 创建项目共享 logger 工厂。
 *
 * 说明：
 * - 复用统一格式与 transport 配置；
 * - 日志目录由调用方显式传入，避免不同服务误写到同一目录；
 * - 未传入时才回退到 utils 包默认目录，方便脚本或测试场景使用。
 */
export function createYuijuLogger(options: CreateYuijuLoggerOptions = {}) {
  const logDir = options.logDir || resolve(currentDir, "../../logs");

  return winston.createLogger({
    level: logLevel,
    transports: [
      new winston.transports.Console({
        level: logLevel,
        format: buildConsoleFormat(),
      }),
      new DailyRotateFile({
        dirname: logDir,
        filename: "app-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: process.env.LOG_MAX_SIZE || "20m",
        maxFiles: process.env.LOG_MAX_FILES || "14d",
        zippedArchive: true,
        level: logLevel,
        format: buildFileFormat(),
      }),
    ],
    exitOnError: false,
  });
}
