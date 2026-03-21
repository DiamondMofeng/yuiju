import { describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    generateText: generateTextMock,
    stepCountIs: vi.fn(() => "mock-stop"),
  };
});

vi.mock("@ai-sdk/deepseek", () => ({
  deepseek: vi.fn(() => "mock-model"),
}));

describe("LLMManager", () => {
  it("聊天链路只暴露统一 memory-search 与角色状态工具", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "回复",
    });

    const { LLMManager } = await import("./manager");
    const manager = new LLMManager(5);
    await manager.chatWithLLM("你好", "小久");

    const tools = generateTextMock.mock.calls[0]?.[0]?.tools;
    expect(tools).toBeDefined();
    expect(tools).toHaveProperty("memorySearch");
    expect(tools).toHaveProperty("queryCharacterState");
    expect(tools).not.toHaveProperty("queryRecentBehaviors");
  });
});
