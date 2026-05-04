import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import { getYuijuConfig } from "../config";

const config = getYuijuConfig();

/**
 * DeepSeek 客户端统一在 utils 层初始化，避免调用方继续隐式依赖环境变量。
 */
export const deepseekProvider = createDeepSeek({
  apiKey: config.llm.deepseekApiKey,
});

/**
 * SiliconFlow 兼容 OpenAI 接口，这里统一收口为公共客户端，便于多包复用小模型与第三方模型。
 */
export const siliconflow = createOpenAICompatible({
  baseURL: "https://api.siliconflow.cn/v1",
  apiKey: config.llm.siliconflowApiKey,
  name: "Siliconflow",
  supportsStructuredOutputs: true,
});

/**
 * 用于低成本判断、裁决等轻量任务的小模型。
 */
export const smallModel = wrapLanguageModel({
  model: siliconflow("Qwen/Qwen3-8B"),
  middleware: [],
});

/**
 * 用于复杂决策、长链路思考的强模型。
 */
export const strongModel = wrapLanguageModel({
  model: siliconflow("deepseek-ai/DeepSeek-V3.2"),
  middleware: [],
});

/**
 * 需要快速响应、轻文本类工作
 */
export const flashModel = wrapLanguageModel({
  model: siliconflow("MiniMaxAI/MiniMax-M2.5"),
  middleware: [],
});

/**
 * 主要用于图片描述（识图场景）
 */
export const qwen3Model = wrapLanguageModel({
  model: siliconflow("Qwen/Qwen3.5-397B-A17B"),
  middleware: [],
});
