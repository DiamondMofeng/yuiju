import type { OnToolCallStartEvent, ToolSet } from "ai";
import { logger } from "../logger";

export interface CreateToolCallLoggingHooksOptions {
  scene: string;
}

export function createToolCallLoggingHooks<TOOLS extends ToolSet = ToolSet>(
  options: CreateToolCallLoggingHooksOptions,
): {
  experimental_onToolCallStart: (event: OnToolCallStartEvent<TOOLS>) => void;
} {
  return {
    experimental_onToolCallStart({ toolCall }) {
      logger.info("[llm.tool-call]", {
        scene: options.scene,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    },
  };
}
