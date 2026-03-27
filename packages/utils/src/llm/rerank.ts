import { getYuijuConfig } from "../config";

const SILICONFLOW_RERANK_ENDPOINT = "https://api.siliconflow.cn/v1/rerank";
const SILICONFLOW_RERANK_MODEL = "Qwen/Qwen3-Reranker-8B";

interface SiliconFlowRerankResponse {
  results?: Array<{
    index?: number;
    relevance_score?: number;
  }>;
}

export interface SiliconFlowRerankCandidate<TItem> {
  item: TItem;
  document: string;
}

export interface RerankableSearchItem {
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * 使用 SiliconFlow 的专业 rerank 模型对候选 Episode 做二阶段重排。
 *
 * 说明：
 * - 放在 utils 中，供不同记忆查询链路复用；
 * - 未配置 key 或请求失败时只记录 error 日志，并返回 null，让上层自行降级。
 */
export async function rerankEpisodesWithSiliconFlow<TItem extends RerankableSearchItem>(input: {
  query: string;
  topK: number;
  candidates: SiliconFlowRerankCandidate<TItem>[];
}): Promise<TItem[] | null> {
  const apiKey = getYuijuConfig().llm.siliconflowApiKey.trim();
  if (!apiKey) {
    console.error("[rerankEpisodesWithSiliconFlow] yuiju.config.ts 中未配置 llm.siliconflowApiKey");
    return null;
  }

  let response: Response;
  try {
    response = await fetch(SILICONFLOW_RERANK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: SILICONFLOW_RERANK_MODEL,
        query: input.query,
        documents: input.candidates.map((candidate) => candidate.document),
        top_n: Math.min(input.topK, input.candidates.length),
        return_documents: false,
      }),
    });
  } catch (error) {
    console.error("[rerankEpisodesWithSiliconFlow] request failed", error);
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[rerankEpisodesWithSiliconFlow] rerank failed: ${response.status} ${text}`);
    return null;
  }

  const json = (await response.json()) as SiliconFlowRerankResponse;
  if (!Array.isArray(json.results)) {
    console.error("[rerankEpisodesWithSiliconFlow] invalid response payload", json);
    return null;
  }

  const rerankedResults = json.results
    .map((item) => {
      const candidate = typeof item.index === "number" ? input.candidates[item.index] : undefined;
      if (!candidate) {
        return null;
      }

      return {
        ...candidate.item,
        score: item.relevance_score ?? candidate.item.score,
        metadata: {
          ...candidate.item.metadata,
          rerankModel: SILICONFLOW_RERANK_MODEL,
          rerankScore: item.relevance_score ?? candidate.item.score,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return rerankedResults;
}
