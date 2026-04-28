import { tool } from "ai";
import { z } from "zod";
import { isDev } from "../../env";
import { logger } from "../../logger";
import { buildPlanUpdateEpisodes, emitMemoryEpisode, planManager } from "../../memory";
import type { AgentPlanChange } from "../../types";
import { reviewPlanChanges } from "./review-plan-changes";
import { agentPlanChangeSchema } from "./schema";

export interface CreatePrivatePlanChangesProposalToolInput {
  sessionLabel: string;
  summary?: string;
  historyJson: string;
}

async function reviewAndApplyPrivatePlanChanges(input: {
  planChanges: AgentPlanChange[];
  sessionLabel: string;
  summary?: string;
  historyJson: string;
}) {
  const reviewResult = await reviewPlanChanges({
    planChanges: input.planChanges,
    chatContext: {
      scene: "private",
      sessionLabel: input.sessionLabel,
      summary: input.summary,
      historyJson: input.historyJson,
    },
  });

  if (!reviewResult.approved) {
    logger.info("[message.plan.private] 私聊计划变更提案未通过审查", {
      sessionLabel: input.sessionLabel,
      reason: reviewResult.reason,
      issues: reviewResult.issues,
      planChanges: input.planChanges,
    });
    return;
  }

  const appliedPlanChanges = (await planManager.applyPlanChanges(input.planChanges)).changes;
  if (appliedPlanChanges.length === 0) {
    return;
  }

  const planEpisodes = buildPlanUpdateEpisodes({
    changes: appliedPlanChanges,
    happenedAt: new Date(),
    isDev: isDev(),
    source: "chat",
    changeReasonPrefix: `本次与 ${input.sessionLabel} 的私聊`,
  });

  for (const planEpisode of planEpisodes) {
    await emitMemoryEpisode(planEpisode);
  }

  logger.info("[message.plan.private] 私聊计划变更已应用", {
    sessionLabel: input.sessionLabel,
    changes: appliedPlanChanges,
  });
}

export function createPrivatePlanChangesProposalTool(
  input: CreatePrivatePlanChangesProposalToolInput,
) {
  return tool({
    description: "提交计划变更提案",
    inputSchema: z.object({
      planChanges: z.array(agentPlanChangeSchema).min(1).describe("候选计划变更"),
    }),
    execute: async ({ planChanges }) => {
      reviewAndApplyPrivatePlanChanges({
        planChanges,
        sessionLabel: input.sessionLabel,
        summary: input.summary,
        historyJson: input.historyJson,
      }).catch((error) => {
        logger.error("[message.plan.private] 处理私聊计划变更提案失败", {
          sessionLabel: input.sessionLabel,
          planChanges,
          error,
        });
      });

      return {
        status: "queued",
        message: "计划变更提案已提交后台审查，当前不代表已经生效。",
      };
    },
  });
}
