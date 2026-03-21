import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionId, type RunningActionState } from "@yuiju/utils";

describe("runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function createRunnerTestContext(initialRunningAction: RunningActionState | null = null) {
    const signalHandlers: Partial<Record<"SIGINT" | "SIGTERM", () => void>> = {};
    let currentRunningAction = initialRunningAction ? { ...initialRunningAction } : null;

    const mockProcess = {
      env: process.env,
      on: vi.fn((event: "SIGINT" | "SIGTERM", handler: () => void) => {
        signalHandlers[event] = handler;
        return mockProcess;
      }),
      exit: vi.fn(),
    };

    const setTimeoutMock = vi.fn(async (_ms: number) => {});
    const tickMock = vi.fn();
    const characterStateMock = {
      getRunningAction: vi.fn(() => (currentRunningAction ? { ...currentRunningAction } : null)),
      setRunningAction: vi.fn(async (runningAction: RunningActionState) => {
        currentRunningAction = { ...runningAction };
      }),
      clearRunningAction: vi.fn(async () => {
        currentRunningAction = null;
      }),
    };
    const worldStateMock = {
      updateTime: vi.fn(async () => {}),
    };

    vi.doMock("node:process", () => ({
      default: mockProcess,
    }));
    vi.doMock("node:timers/promises", () => ({
      setTimeout: setTimeoutMock,
    }));
    vi.doMock("../../src/engine/tick", () => ({
      tick: tickMock,
    }));
    vi.doMock("@/state/character-state", () => ({
      characterState: characterStateMock,
    }));
    vi.doMock("@/state/world-state", () => ({
      worldState: worldStateMock,
    }));

    const { startRealtimeLoop } = await import("../../src/engine/runner");

    return {
      startRealtimeLoop,
      signalHandlers,
      setTimeoutMock,
      tickMock,
      characterStateMock,
    };
  }

  it("启动时会恢复未完成等待，并把 completionEvent 传给下一次 tick", async () => {
    const { startRealtimeLoop, signalHandlers, setTimeoutMock, tickMock, characterStateMock } =
      await createRunnerTestContext({
        action: ActionId.Sleep,
        actionStartedAt: "2026-03-18T10:00:00.000Z",
        actionDurationMinutes: 10,
        waitUntil: dayjs().add(2, "minute").toISOString(),
        completionEvent: "睡醒了",
      });

    tickMock.mockResolvedValueOnce({
      nextTickInMinutes: 1,
      completionEvent: "新的事件",
    });

    setTimeoutMock.mockImplementation(async () => {
      if (setTimeoutMock.mock.calls.length >= 2) {
        signalHandlers.SIGINT?.();
      }
    });

    await startRealtimeLoop();

    expect(setTimeoutMock).toHaveBeenCalledTimes(2);
    const firstWaitMs = setTimeoutMock.mock.calls.at(0)?.[0];
    expect(firstWaitMs).toBeTypeOf("number");
    expect(firstWaitMs ?? 0).toBeGreaterThan(0);
    expect(characterStateMock.clearRunningAction).toHaveBeenCalledTimes(1);
    expect(tickMock).toHaveBeenCalledWith({ eventDescription: "睡醒了" });
  });

  it("等待时间已过时会直接进入下一次 tick，不再额外等待", async () => {
    const { startRealtimeLoop, signalHandlers, setTimeoutMock, tickMock, characterStateMock } =
      await createRunnerTestContext({
        action: ActionId.Go_To_School_From_Home,
        actionStartedAt: "2026-03-18T08:00:00.000Z",
        actionDurationMinutes: 30,
        waitUntil: dayjs().subtract(5, "minute").toISOString(),
        completionEvent: "到学校了",
      });

    tickMock.mockResolvedValueOnce({
      nextTickInMinutes: 1,
      completionEvent: "新的事件",
    });

    setTimeoutMock.mockImplementation(async () => {
      signalHandlers.SIGINT?.();
    });

    await startRealtimeLoop();

    expect(setTimeoutMock).toHaveBeenCalledTimes(1);
    expect(tickMock).toHaveBeenCalledWith({ eventDescription: "到学校了" });
    expect(characterStateMock.clearRunningAction).toHaveBeenCalledTimes(1);
  });

  it("新 action 进入等待前会先持久化运行态，等待结束后清理", async () => {
    const { startRealtimeLoop, signalHandlers, setTimeoutMock, tickMock, characterStateMock } =
      await createRunnerTestContext();

    tickMock.mockResolvedValueOnce({
      nextTickInMinutes: 3,
      completionEvent: "学习完成",
      runningAction: {
        action: ActionId.Study_At_School,
        actionStartedAt: "2026-03-18T09:00:00.000Z",
        actionDurationMinutes: 3,
        completionEvent: "学习完成",
      },
    });

    setTimeoutMock.mockImplementation(async () => {
      signalHandlers.SIGINT?.();
    });

    await startRealtimeLoop();

    expect(characterStateMock.setRunningAction).toHaveBeenCalledTimes(1);
    expect(characterStateMock.setRunningAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ActionId.Study_At_School,
        actionStartedAt: "2026-03-18T09:00:00.000Z",
        actionDurationMinutes: 3,
        completionEvent: "学习完成",
        waitUntil: expect.any(String),
      }),
    );
    const savedRunningAction = characterStateMock.setRunningAction.mock.lastCall?.[0] as
      | RunningActionState
      | undefined;
    expect(dayjs(savedRunningAction?.waitUntil).isValid()).toBe(true);
    expect(characterStateMock.clearRunningAction).toHaveBeenCalledTimes(1);
  });
});
