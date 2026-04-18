import type { Dayjs } from "dayjs";
import { getTimeWithWeekday } from "../time";

interface BehaviorParameter {
  /** 参数值，如："苹果"、"面包" */
  value: string;
  /** 数量，默认为 1 */
  quantity?: number;
}

export interface BehaviorRecord {
  /** 行为/事件类型 */
  behavior: string;
  /** 行为描述 */
  description: string;
  time: Dayjs;
  /** Agent 选择的行为参数 */
  parameters?: BehaviorParameter[];
}

export function generateRecentBehaviorPrompt(behaviorRecordList: BehaviorRecord[]) {
  if (!behaviorRecordList.length) {
    return "（无）";
  }

  return behaviorRecordList
    .map((item) => {
      return `- [${item.behavior}] (${getTimeWithWeekday(item.time)}) ${item.description}`;
    })
    .join("\n");
}
