import type { FactCandidate } from "./fact";

export interface WriteFactsInput {
  is_dev?: boolean;
  facts: FactCandidate[];
}

export interface SearchMemoryInput {
  query: string;
  is_dev?: boolean;
  top_k?: number;
  counterparty_name?: string;
  filters?: Record<string, unknown>;
}

export interface MemorySearchItem {
  memory: string;
  time?: string | null;
  source?: string | null;
  score?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  evidenceIds?: string[];
  evidence_ids?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export class MemoryServiceClient {
  constructor(private baseUrl: string) {}

  /**
   * 写入提炼后的事实列表。
   */
  async writeFacts(input: WriteFactsInput): Promise<string[]> {
    const res = await fetch(new URL("/v1/facts", this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_dev: input.is_dev,
        facts: input.facts,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MemoryService writeFacts failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { fact_ids?: unknown };
    return Array.isArray(json.fact_ids)
      ? json.fact_ids.filter((item): item is string => typeof item === "string")
      : [];
  }

  /**
   * 检索相关记忆。
   *
   * 说明：
   * - 当前同时兼容旧版 Python 服务的简单结果结构；
   * - 当服务端补充 evidence / metadata 后，调用方可直接消费这些字段。
   */
  async searchMemory(input: SearchMemoryInput): Promise<MemorySearchItem[]> {
    const res = await fetch(new URL("/v1/search", this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        is_dev: input.is_dev,
        top_k: input.top_k ?? 5,
        counterparty_name: input.counterparty_name,
        filters: input.filters,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MemoryService searchMemory failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      throw new Error("MemoryService searchMemory: invalid response");
    }

    return json as MemorySearchItem[];
  }
}

/**
 *
 * 说明：
 * - 该函数返回 null，用于让调用方（world/message）在未配置时选择跳过写入/检索。
 */
export function getMemoryServiceClientFromEnv(): MemoryServiceClient | null {
  return new MemoryServiceClient("http://localhost:9196");
}
