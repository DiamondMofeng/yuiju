import { deepseek } from "@ai-sdk/deepseek";
import { getCharacterCardPrompt } from "@yuiju/source";
import {
  getMemoryServiceClientFromEnv,
  memorySearchTool,
  queryCharacterStateTool,
} from "@yuiju/utils";
import { generateText, type ModelMessage, stepCountIs } from "ai";
import { ChatSessionManager } from "../chat-session-manager";

export class LLMManager {
  private memoryClient = getMemoryServiceClientFromEnv();
  private session: ChatSessionManager;

  constructor(conversationLimit: number = 10) {
    this.session = new ChatSessionManager({
      conversationLimit,
      memoryClient: this.memoryClient,
      windowMs: 10 * 60 * 1000,
    });
  }

  public async chatWithLLM(input: string, userName: string) {
    const systemPrompt = getCharacterCardPrompt({
      userName,
    });

    this.session.recordMessage({
      counterparty_name: userName,
      role: "user",
      content: input,
      timestamp: new Date(),
    });
    const messages: ModelMessage[] = this.session.getLLMMessages(userName);

    const result = await generateText({
      model: deepseek("deepseek-chat"),
      messages,
      system: systemPrompt,
      tools: {
        memorySearch: memorySearchTool,
        queryCharacterState: queryCharacterStateTool,
      },
      stopWhen: stepCountIs(5),
    });

    // 添加助手回复到对话历史
    this.session.recordMessage({
      counterparty_name: userName,
      role: "assistant",
      content: result.text,
      timestamp: new Date(),
    });

    return result;
  }
}

// 导出默认实例
export const llmManager = new LLMManager();
