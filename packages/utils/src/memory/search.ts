import {
  type MemoryQueryTimeSort,
  type MemoryQueryType,
  type MemorySearchResult,
  memoryQueryRouter,
} from "./query-router";

/**
 * 兼容旧调用侧的类型别名。
 *
 * 说明：
 * - P0 后统一由 query-router 提供真实实现；
 * - 这里仅保留兼容出口，避免一次性打碎现有 import。
 */
export type MemorySearchMode = MemoryQueryType;
export type StructuredMemorySearchItem = MemorySearchResult;

/**
 * 兼容包装：后续新代码应直接使用 memoryQueryRouter.search。
 */
export async function searchStructuredMemory(input: {
  query: string;
  mode: MemorySearchMode;
  startTime?: string;
  endTime?: string;
  timeSort?: MemoryQueryTimeSort;
  counterpartyName?: string;
  topK?: number;
}): Promise<StructuredMemorySearchItem[]> {
  return await memoryQueryRouter.search({
    query: input.query,
    memoryType: input.mode,
    startTime: input.startTime,
    endTime: input.endTime,
    timeSort: input.timeSort,
    counterpartyName: input.counterpartyName,
    topK: input.topK,
  });
}
