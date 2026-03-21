// import process from "node:process";
import { setTimeout } from "node:timers/promises";
import dayjs from "dayjs";
import { characterState } from "@/state/character-state";
import { worldState } from "@/state/world-state";
import { tick } from "./tick";

let running = false;
let stopped = false;

// process.on("SIGINT", () => {
//   stopped = true;
//   process.exit();
// });
// process.on("SIGTERM", () => {
//   stopped = true;
//   process.exit();
// });

/**
 * 等待运行中的 action 结束。
 *
 * 说明：
 * - 若等待目标时间已过，则直接跳过等待，按真实经过时间补偿；
 * - 等待结束后统一清理运行态，避免重启时重复恢复同一 action。
 */
async function waitForRunningAction(): Promise<string | undefined> {
  const runningAction = characterState.getRunningAction();

  if (!runningAction) {
    return undefined;
  }

  const remainingMs = Math.max(dayjs(runningAction.waitUntil).diff(dayjs()), 0);

  if (remainingMs > 0) {
    await setTimeout(remainingMs);
  }

  await characterState.clearRunningAction();
  return runningAction.completionEvent;
}

/**
 * 执行一次 tick，并在进入等待前持久化运行中的 action。
 *
 * 这样当进程在等待阶段退出时，重启后仍可继续剩余等待逻辑。
 */
async function executeTickAndPersistRunningAction(
  eventDescription?: string,
): Promise<string | undefined> {
  await worldState.updateTime();

  const tickResult = await tick({
    eventDescription,
  });

  if (!tickResult.runningAction) {
    await setTimeout(tickResult.nextTickInMinutes * 60 * 1000);
    return tickResult.completionEvent;
  }

  const waitUntil = dayjs().add(tickResult.nextTickInMinutes, "minute").toISOString();
  await characterState.setRunningAction({
    ...tickResult.runningAction,
    waitUntil,
  });

  return waitForRunningAction();
}

export async function startRealtimeLoop() {
  stopped = false;
  if (running) return;
  running = true;

  try {
    let eventDescription = await waitForRunningAction();

    while (!stopped) {
      eventDescription = await executeTickAndPersistRunningAction(eventDescription);
    }
  } finally {
    running = false;
  }
}
