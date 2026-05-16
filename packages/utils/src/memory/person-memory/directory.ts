import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dayjs from "dayjs";
import { logger } from "../../logger";
import { PERSON_MEMORY_HEAT_FILENAME, readPersonMemoryHeatDocument } from "./heat";
import { getPersonMemoryDirectoryPath, parsePersonMemoryJson } from "./storage";
import type { PersonMemoryDirectoryResult } from "./types";

const PERSON_MEMORY_LIST_PAGE_SIZE = 20;

export async function listPersonMemories(page = 1): Promise<PersonMemoryDirectoryResult> {
  const rootDir = await getPersonMemoryDirectoryPath();
  const filenames = await readdir(rootDir);
  const heatDocument = await readPersonMemoryHeatDocument();

  const entries: string[] = [];

  for (const filename of filenames.sort()) {
    if (!filename.endsWith(".json") || filename === PERSON_MEMORY_HEAT_FILENAME) {
      continue;
    }

    try {
      const content = await readFile(resolve(rootDir, filename), "utf8");
      const document = parsePersonMemoryJson(content);

      entries.push(document.nickname);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[person-memory] 跳过非法人物记忆文件 ${filename}: ${message}`);
    }
  }

  entries.sort((left, right) => {
    const leftHeat = heatDocument[left]?.heat ?? 0;
    const rightHeat = heatDocument[right]?.heat ?? 0;

    if (rightHeat !== leftHeat) {
      return rightHeat - leftHeat;
    }

    const leftLastInteractedAt = heatDocument[left]?.lastInteractedAt;
    const rightLastInteractedAt = heatDocument[right]?.lastInteractedAt;
    const leftLastInteractedAtMs = leftLastInteractedAt ? dayjs(leftLastInteractedAt).valueOf() : 0;
    const rightLastInteractedAtMs = rightLastInteractedAt
      ? dayjs(rightLastInteractedAt).valueOf()
      : 0;

    if (rightLastInteractedAtMs !== leftLastInteractedAtMs) {
      return rightLastInteractedAtMs - leftLastInteractedAtMs;
    }

    return left.localeCompare(right);
  });

  const pageNumber = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const startIndex = (pageNumber - 1) * PERSON_MEMORY_LIST_PAGE_SIZE;
  const items = entries.slice(startIndex, startIndex + PERSON_MEMORY_LIST_PAGE_SIZE);

  return {
    items,
    page_number: pageNumber,
    total: entries.length,
    hasMore: startIndex + PERSON_MEMORY_LIST_PAGE_SIZE < entries.length,
  };
}
