import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dayjs from "dayjs";
import { z } from "zod";
import { logger } from "../../logger";
import { formatProjectTime } from "../../time";
import { PersonMemoryFormatError } from "./format";
import {
  getPersonMemoryDirectoryPath,
  isFileNotFoundError,
  parsePersonMemoryJson,
} from "./storage";

interface PersonMemoryHeatEntry {
  heat: number;
  lastInteractedAt: string;
}

/**
 * people/person-memory-heat.json 的结构：
 * {
 *   [nickname]: {
 *     heat: 累计发言热度,
 *     lastInteractedAt: 最近一次累计热度的时间
 *   }
 * }
 */
export type PersonMemoryHeatDocument = Record<string, PersonMemoryHeatEntry>;

export const PERSON_MEMORY_HEAT_FILENAME = "person-memory-heat.json";

const personMemoryHeatSchema = z.record(
  z.string().min(1),
  z.strictObject({
    heat: z.number().finite().nonnegative(),
    lastInteractedAt: z.string().min(1),
  }),
);

export async function getPersonMemoryHeatFilePath(): Promise<string> {
  return resolve(await getPersonMemoryDirectoryPath(), PERSON_MEMORY_HEAT_FILENAME);
}

export async function initializePersonMemoryHeat(): Promise<void> {
  const rootDir = await getPersonMemoryDirectoryPath();
  const heatFilePath = await getPersonMemoryHeatFilePath();
  const filenames = await readdir(rootDir);
  let heatDocument: PersonMemoryHeatDocument = {};
  let shouldWriteHeatFile = false;

  try {
    const stats = await stat(heatFilePath);
    if (!stats.isFile()) {
      throw new Error(`人物记忆热度文件路径不是文件：${heatFilePath}`);
    }

    heatDocument = await readPersonMemoryHeatDocument();
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }

    shouldWriteHeatFile = true;
  }

  for (const filename of filenames.sort()) {
    if (!filename.endsWith(".json") || filename === PERSON_MEMORY_HEAT_FILENAME) {
      continue;
    }

    try {
      const content = await readFile(resolve(rootDir, filename), "utf8");
      const document = parsePersonMemoryJson(content);

      if (heatDocument[document.nickname]) {
        continue;
      }

      heatDocument[document.nickname] = {
        heat: 0,
        lastInteractedAt: document.lastUpdatedAt,
      };
      shouldWriteHeatFile = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[person-memory] 初始化热度时跳过非法人物记忆文件 ${filename}: ${message}`);
    }
  }

  if (!shouldWriteHeatFile) {
    return;
  }

  await writeFile(heatFilePath, `${JSON.stringify(heatDocument, null, 2)}\n`, "utf8");
}

export async function readPersonMemoryHeatDocument(): Promise<PersonMemoryHeatDocument> {
  const filePath = await getPersonMemoryHeatFilePath();
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {};
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PersonMemoryFormatError("人物记忆热度文件不是合法 JSON。");
  }

  const parsedResult = personMemoryHeatSchema.safeParse(parsed);
  if (!parsedResult.success) {
    throw new PersonMemoryFormatError("人物记忆热度 JSON 对象结构不合法。");
  }

  for (const [nickname, item] of Object.entries(parsedResult.data)) {
    if (!dayjs(item.lastInteractedAt).isValid()) {
      throw new PersonMemoryFormatError(
        `人物记忆热度文件中 ${nickname} 的 lastInteractedAt 不是合法时间。`,
      );
    }
  }

  return parsedResult.data;
}

export async function updatePersonMemoryHeat(input: {
  nickname: string;
  interactionCount: number;
}): Promise<void> {
  const interactionCount = Math.max(0, Math.floor(input.interactionCount));
  if (interactionCount === 0) {
    return;
  }

  const heatDocument = await readPersonMemoryHeatDocument();
  const currentHeat = heatDocument[input.nickname]?.heat ?? 0;

  heatDocument[input.nickname] = {
    heat: currentHeat + interactionCount,
    lastInteractedAt: formatProjectTime(new Date(), "YYYY-MM-DDTHH:mm:ssZ"),
  };

  await writeFile(
    await getPersonMemoryHeatFilePath(),
    `${JSON.stringify(heatDocument, null, 2)}\n`,
    "utf8",
  );
}
