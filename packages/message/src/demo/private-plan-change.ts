import {
  ActionId,
  type CharacterStateData,
  closeRedis,
  connectDB,
  getRedis,
  initCharacterStateData,
  MajorScene,
  type PlanState,
  planManager,
  REDIS_KEY_CHARACTER_STATE,
  savePlanStateData,
} from "@yuiju/utils";
import mongoose from "mongoose";
import { llmManager } from "@/llm/manager";
import { stickerState } from "@/state/sticker";
import type { StoredPrivateMessage } from "@/utils/message";

const DEMO_USER_ID = 10001;
const DEMO_USER_NICKNAME = "小久";
const DEMO_SELF_ID = 20001;
const RESTORE_PLAN_AFTER_DEMO = true;
const RESTORE_CHARACTER_AFTER_DEMO = true;
const PLAN_APPLY_WAIT_MS = 60_000;
const PLAN_APPLY_POLL_MS = 1_000;
const DEMO_PRIVATE_MESSAGE_TEXT = "今天给你过生日，记得早点回家哦";

function createDemoCharacterState(): CharacterStateData {
  return {
    action: ActionId.Idle,
    location: { major: MajorScene.School },
    stamina: 78,
    satiety: 62,
    mood: 74,
    money: 120,
    dailyActionsDoneToday: [],
    inventory: [],
    runningAction: null,
  };
}

function createDemoInitialPlanState(now: string): PlanState {
  return {
    shortTermPlans: [
      {
        id: "demo_short_term_after_school_library",
        title: "今天放学后去图书馆自习",
        scope: "shortTerm",
        reason: "私聊计划变更 demo 的初始放学后安排",
        source: "system",
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };
}

async function saveCharacterStateForDemo(state: CharacterStateData) {
  const redis = getRedis();

  await redis.hset(REDIS_KEY_CHARACTER_STATE, {
    action: state.action,
    location: JSON.stringify(state.location),
    stamina: state.stamina,
    satiety: state.satiety,
    mood: state.mood,
    money: state.money,
    dailyActionsDoneToday: JSON.stringify(state.dailyActionsDoneToday),
    inventory: JSON.stringify(state.inventory ?? []),
    runningAction: JSON.stringify(state.runningAction),
  });
}

function createDemoPrivateMessage(): StoredPrivateMessage {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    self_id: DEMO_SELF_ID,
    user_id: DEMO_USER_ID,
    time: nowSeconds,
    message_id: nowSeconds,
    message_seq: nowSeconds,
    real_id: nowSeconds,
    message_type: "private",
    message_format: "array",
    sub_type: "friend",
    post_type: "message",
    raw_message: DEMO_PRIVATE_MESSAGE_TEXT,
    font: 0,
    sender: {
      user_id: DEMO_USER_ID,
      nickname: DEMO_USER_NICKNAME,
      card: "",
    },
    message: [
      {
        type: "text",
        data: {
          text: DEMO_PRIVATE_MESSAGE_TEXT,
        },
      },
    ],
  };
}

async function waitForPlanStateChange(before: PlanState): Promise<PlanState> {
  const startedAt = Date.now();
  const beforeJson = JSON.stringify(before);

  while (Date.now() - startedAt < PLAN_APPLY_WAIT_MS) {
    const current = await planManager.getState();
    if (JSON.stringify(current) !== beforeJson) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, PLAN_APPLY_POLL_MS));
  }

  return planManager.getState();
}

export async function main() {
  const originalCharacterState = await initCharacterStateData();
  const originalPlanState = await planManager.getState();
  const demoCharacterState = createDemoCharacterState();
  const initialPlanState = createDemoInitialPlanState(new Date().toISOString());

  try {
    await connectDB();
    await stickerState.initialize();
    await saveCharacterStateForDemo(demoCharacterState);
    await savePlanStateData(initialPlanState);

    const message = createDemoPrivateMessage();
    llmManager.recordPrivateMessage(message, DEMO_USER_NICKNAME);

    const chatResult = await llmManager.chatWithLLM(message);

    console.log("\n=== LLM CHAT RESULT ===\n");
    console.log(JSON.stringify(chatResult, null, 2));
    console.log("\n等待私聊计划变更后台审查与应用...");

    const finalPlanState = await waitForPlanStateChange(initialPlanState);

    console.log("\n=== FINAL PLAN STATE ===\n");
    console.log(JSON.stringify(finalPlanState, null, 2));
  } finally {
    if (RESTORE_PLAN_AFTER_DEMO) {
      await savePlanStateData(originalPlanState);
      console.log("\n已恢复 demo 前的计划状态。");
    }

    if (RESTORE_CHARACTER_AFTER_DEMO) {
      await saveCharacterStateForDemo(originalCharacterState);
      console.log("已恢复 demo 前的角色状态。");
    }

    await mongoose.disconnect();
    await closeRedis();
  }
}
