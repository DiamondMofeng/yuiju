import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("chooseActionAgent", () => {
  it("会注册 memorySearch 工具，并在 prompt 中要求按需查询记忆", async () => {
    const agentFile = path.resolve(import.meta.dirname, "../../src/llm/agent.ts");
    const promptFile = path.resolve(import.meta.dirname, "../../../source/prompt/world-view.ts");

    const agentSource = fs.readFileSync(agentFile, "utf-8");
    const promptSource = fs.readFileSync(promptFile, "utf-8");

    expect(agentSource).toContain("memorySearch: unifiedMemorySearchTool");
    expect(promptSource).toContain("优先调用 \\`memorySearch\\` 查询记忆");
  });
});
