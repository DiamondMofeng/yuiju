import {
  type ActionAgentDecision,
  type ActionContext,
  ActionId,
  emitMemoryEpisode,
  getRecentMemoryEpisodes,
  isDev,
  type PlanChange,
  type RunningActionState,
  SUBJECT_NAME,
} from "@yuiju/utils";
import { getActionList } from "@/action";
import { getActionById } from "@/action/utils";
import { chooseActionAgent } from "@/llm/agent";
import { buildBehaviorEpisode, buildPlanUpdateEpisodes } from "@/memory/episode-builder";
import { planManager } from "@/plan";
import { characterState } from "@/state/character-state";
import { worldState } from "@/state/world-state";
import { logger } from "@/utils/logger";

export async function getDurationTime(
  durationMin:
    | number
    | ((context: ActionContext, selectedAction?: ActionAgentDecision) => Promise<number>),
  context: ActionContext,
  selectedAction?: ActionAgentDecision,
) {
  if (typeof durationMin === "function") {
    return durationMin(context, selectedAction);
  } else {
    return durationMin;
  }
}

export interface TickParams {
  eventDescription?: string;
}

export interface TickReturn {
  nextTickInMinutes: number;
  completionEvent?: string;
  runningAction?: Omit<RunningActionState, "waitUntil">;
}

function isValidPlanProposal(decision: ActionAgentDecision): boolean {
  const proposal = decision.planProposal;
  if (!proposal) {
    return false;
  }

  return Boolean(proposal.longTermPlanTitle || proposal.shortTermPlanTitles?.length);
}

export async function tick(params: TickParams): Promise<TickReturn> {
  const context: ActionContext = {
    characterState: characterState,
    worldState,
    eventDescription: params.eventDescription,
  };

  const actionList = getActionList(context);
  const planState = await planManager.getState();

  if (actionList.length === 0) {
    const idleAction = getActionById(ActionId.Idle);
    logger.error("[tick] action list is empty");

    const durationMin = await getDurationTime(idleAction.durationMin, context);
    return { nextTickInMinutes: durationMin };
  }

  logger.info(
    `[tick] Available actions: [${actionList.map((a) => a.action).join(", ")}]`,
    context.characterState.log(),
    context.worldState.log(),
  );

  const recentBehaviors = await getRecentMemoryEpisodes({
    limit: 10,
    types: ["behavior"],
    subject: SUBJECT_NAME,
    isDev: isDev(),
    onlyDate: new Date(),
  });
  const history = recentBehaviors.map((behavior) => ({
    behavior: String(behavior.payload.action ?? ActionId.Idle) as ActionId,
    description: String(behavior.payload.reason ?? behavior.summaryText),
    timestamp: behavior.happenedAt.getTime(),
  }));

  const selectedAction = await chooseActionAgent(actionList, context, history, planState);
  const actionMetadata = actionList.find((item) => item.action === selectedAction?.action);

  if (actionMetadata && selectedAction) {
    const actionStartedAt = new Date();
    let planChanges: PlanChange[] = [];

    if (selectedAction.planProposal && isValidPlanProposal(selectedAction)) {
      const planApplyResult = await planManager.applyProposal(selectedAction.planProposal);
      planChanges = planApplyResult.changes;
    } else if (selectedAction.planProposal) {
      logger.warn("[tick] ignore empty planProposal from chooseActionAgent", selectedAction);
    }

    const planEpisodes = buildPlanUpdateEpisodes({
      changes: planChanges,
      happenedAt: new Date(),
      isDev: isDev(),
    });

    for (const planEpisode of planEpisodes) {
      try {
        await emitMemoryEpisode(planEpisode);
        logger.info("[tick] built plan_update episode", planEpisode);
      } catch (error) {
        logger.error("[tick] write plan_update episode failed", error);
      }
    }

    // 执行行为
    const executionResult = await actionMetadata.executor(context, selectedAction);

    // 更新世界时间（第一次）
    await context.worldState.updateTime();

    // 计算行为持续时间
    const durationMin = await getDurationTime(actionMetadata.durationMin, context, selectedAction);

    const behaviorEpisode = buildBehaviorEpisode({
      context,
      selectedAction,
      executionResult: executionResult ?? undefined,
      durationMinutes: durationMin,
      happenedAt: new Date(),
      isDev: isDev(),
    });

    if (behaviorEpisode) {
      try {
        await emitMemoryEpisode(behaviorEpisode);
        logger.debug("[tick] built behavior episode", behaviorEpisode);
      } catch (e) {
        logger.error("[tick] build world_action episode failed", e);
      }
    }

    const completionEvent =
      typeof actionMetadata.completionEvent === "function"
        ? await actionMetadata.completionEvent(context, selectedAction)
        : actionMetadata.completionEvent;

    logger.info(
      `[tick] Executed action: ${selectedAction.action}, Reason: ${selectedAction.reason}， Duration: ${durationMin} minutes`,
      context.characterState.log(),
      context.worldState.log(),
    );

    return {
      nextTickInMinutes: durationMin,
      completionEvent,
      runningAction: {
        action: selectedAction.action,
        actionStartedAt: actionStartedAt.toISOString(),
        actionDurationMinutes: durationMin,
        completionEvent,
      },
    };
  } else {
    const idleAction = getActionById(ActionId.Idle);
    logger.error("[tick] LLM selected action is not executable.", selectedAction);
    const durationMin = await getDurationTime(idleAction.durationMin, context);
    return { nextTickInMinutes: durationMin };
  }
}
