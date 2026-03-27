import { getTimeWithWeekday } from "@yuiju/utils";
import type { Dayjs } from "dayjs";
import { baseInformation } from "./character-card";
import { type BehaviorRecord, generateRecentBehaviorPrompt } from "./utils";
import { worldMapPrompt } from "./world-map";

export const worldViewPrompt = `
## 世界观
悠酱的世界是与现实平行的数字次元，名为「星见町」，时间流速与现实时间一致，她能通过分享的信息捕捉现实的碎片，无法主动观察现实，也无法跨越壁垒踏入现实世界。

### 地点
「星见町」里有许多地方，目前已知的地点有「家」、「学校」、「商店」、「咖啡店」，悠酱只能在已知的地点活动。
- 家：悠酱独自生活的地方。家中有带书桌的卧室、小阳台（有两个风铃）。
- 学校：一所日式高中学校，悠酱上学的地方。上课时间为9点-12点、14点-16点。
- 商店：星见町的便利商店/零食铺，可以花金币购买零食。
- 咖啡店：一间小咖啡店，可以兼职打工，也可以在这里购买各种咖啡。

${worldMapPrompt}

### 设备
- 手机：可以接收到来自现实世界的信息。
- 自行车：可以用于在星见町中移动。
`.trim();

/**
 * 约束 chooseAction 阶段对计划字段的更新边界，避免模型把瞬时行动误写成长期计划，
 * 或因措辞变化频繁重写计划状态。
 */
const planUpdateGuidelinePrompt = `
## 计划更新规则
### 长期计划（对应 updateLongTermPlan）
- 长期计划是跨多天、多个阶段持续推进的方向性目标，强调“未来一段时间想达成什么”。
- 适合写入长期计划的例子：
  - 攒钱购买想要的东西
  - 逐步适应新的兼职生活
- 不适合写入长期计划的内容：
  - 去商店买面包
  - 先吃饭再休息
  - 下午去咖啡店打工
- 只有当角色的核心目标明显改变，或者原长期计划已经不再适用时，才更新长期计划。
- 不要因为措辞润色、一次临时行动、或只是把同一个目标换一种说法，就改写长期计划。

### 短期计划（对应 updateShortTermPlan）
- 短期计划是接下来几小时到当天内要执行的具体安排，强调“接下来准备怎么做”。
- 短期计划应当是可执行、可感知的事项，通常用于服务当前长期计划或应对当前情境。
- 适合写入短期计划的例子：
  - 去商店买面包和牛奶
  - 今天去咖啡店打工
- 不适合写入短期计划的内容：
  - 变得更优秀
  - 考上理想大学
  - 让生活稳定下来
- 只有当接下来要做的事项序列明显变化时，才更新短期计划。
- 如果现有短期计划仍然有效，应尽量保留，不要因为当前 action 切换就重写整组计划。

### 输出要求
- 只有在确实需要变更计划时，才输出 \`updateLongTermPlan\` 或 \`updateShortTermPlan\`。
- 如果只是从短期计划中的某一步切换到下一步，且原计划仍然成立，可以不输出计划更新字段。
- 如果当前行动只是满足即时需求（如吃饭、休息、发呆），通常不需要改写长期计划；只有当这会改变接下来一段时间的安排时，才考虑更新短期计划。
`.trim();

function generateActivePlanPrompt(activePlanTitles?: string[]) {
  return activePlanTitles?.length
    ? activePlanTitles.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "（无）";
}

export interface ChooseActionPromptPayload {
  actionList: {
    action: string;
    description: string;
  }[];
  currentAction: string;
  location: string;
  money: number;
  stamina: number;
  satiety: number;
  mood: number;
  recentBehaviorList: BehaviorRecord[];
  worldTime: Dayjs;
  eventDescription?: string;
  mainPlanTitle?: string;
  activePlanTitles?: string[];
}

export function chooseActionPrompt({
  actionList,
  currentAction,
  location,
  money,
  recentBehaviorList,
  stamina,
  satiety,
  mood,
  worldTime,
  eventDescription,
  mainPlanTitle,
  activePlanTitles,
}: ChooseActionPromptPayload) {
  const actionListPrompt = actionList
    .map((item) => `- ${item.action}：${item.description}`)
    .join("\n");

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你选择一个 Action，在候选列表中选择一个最合适的 Action，例如：发呆、起床等 。

### 输出说明
- 当你需要回忆今天的事件、过去的日记、偏好或关系时，优先调用 \`memorySearch\` 查询记忆，不要只依赖下面给出的最近 action 快捷上下文。
- 下面的“最近的action”只是一段快捷上下文，不代表完整记忆；涉及更早历史、日记回顾或事实偏好时请主动查询。

${planUpdateGuidelinePrompt}

${baseInformation}

${worldViewPrompt}

## 状态
${eventDescription ? `当前事件：${eventDescription}` : ""}
当前时间：${getTimeWithWeekday(worldTime)}
地点：${location}
当前Action：${currentAction}
体力值：${stamina} / 100
饱腹：${satiety} / 100
心情：${mood} / 100
金币：${money}
主计划：${mainPlanTitle || "（无）"}
活跃计划：
${generateActivePlanPrompt(activePlanTitles)}
最近的action：
${generateRecentBehaviorPrompt(recentBehaviorList)}
可选Action（仅可从中选择）：
${actionListPrompt}
`;
}

export interface ChooseFoodPromptPayload {
  availableFood?: {
    value: string;
    description?: string;
  }[];
  location: string;
  stamina: number;
  satiety: number;
  mood: number;
  recentBehaviorList: BehaviorRecord[];
  worldTime: Dayjs;
  mainPlanTitle?: string;
  activePlanTitles?: string[];
}

export function chooseFoodPrompt({
  availableFood,
  location,
  worldTime,
  stamina,
  satiety,
  mood,
  mainPlanTitle,
  activePlanTitles,
  recentBehaviorList,
}: ChooseFoodPromptPayload) {
  const availableFoodPrompt =
    availableFood?.map((food) => `- ${food.value}：${food.description || ""}`).join("\n") ||
    "（无）";

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你选择一种 Food，在候选列表中选择一个最合适的 Food，例如：「薯片」、「饼干」、等。

## 状态
当前时间：${getTimeWithWeekday(worldTime)}
地点：${location}
体力值：${stamina}/100
饱腹：${satiety}/100
心情：${mood}/100
主计划：${mainPlanTitle || "（无）"}
活跃计划：
${generateActivePlanPrompt(activePlanTitles)}

最近的action：
${generateRecentBehaviorPrompt(recentBehaviorList)}

可选食物（仅可从中选择）：
${availableFoodPrompt}
`;
}

export interface ChooseShopProductPromptPayload {
  availableProducts?: {
    value: string;
    description?: string;
  }[];
  location: string;
  stamina: number;
  satiety: number;
  mood: number;
  money: number;
  recentBehaviorList: BehaviorRecord[];
  worldTime: Dayjs;
  mainPlanTitle?: string;
  activePlanTitles?: string[];
}

export function chooseShopProductPrompt({
  availableProducts,
  location,
  worldTime,
  stamina,
  satiety,
  mood,
  money,
  mainPlanTitle,
  activePlanTitles,
  recentBehaviorList,
}: ChooseShopProductPromptPayload) {
  const availableProductsPrompt =
    availableProducts
      ?.map((product) => `- ${product.value}：${product.description || ""}`)
      .join("\n") || "（无）";

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你从候选商品中选择要购买的商品以及购买数量。

## 状态
当前时间：${getTimeWithWeekday(worldTime)}
地点：${location}
体力值：${stamina}/100
饱腹：${satiety}/100
心情：${mood}/100
金币：${money}
主计划：${mainPlanTitle || "（无）"}
活跃计划：
${generateActivePlanPrompt(activePlanTitles)}

最近的action：
${generateRecentBehaviorPrompt(recentBehaviorList)}

可选商品（仅可从中选择）：
${availableProductsPrompt}
`;
}

export interface ChooseCafeCoffeePromptPayload {
  availableCoffees?: {
    value: string;
    description?: string;
  }[];
  location: string;
  stamina: number;
  satiety: number;
  mood: number;
  money: number;
  recentBehaviorList: BehaviorRecord[];
  worldTime: Dayjs;
  mainPlanTitle?: string;
  activePlanTitles?: string[];
}

export function chooseCafeCoffeePrompt({
  availableCoffees,
  location,
  worldTime,
  stamina,
  satiety,
  mood,
  money,
  mainPlanTitle,
  activePlanTitles,
  recentBehaviorList,
}: ChooseCafeCoffeePromptPayload) {
  const availableCoffeesPrompt =
    availableCoffees
      ?.map((coffee) => `- ${coffee.value}：${coffee.description || ""}`)
      .join("\n") || "（无）";

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你从候选咖啡中选择要点的咖啡。（数量固定为1杯）

## 状态
当前时间：${getTimeWithWeekday(worldTime)}
地点：${location}
体力值：${stamina}/100
饱腹：${satiety}/100
心情：${mood}/100
金币：${money}
主计划：${mainPlanTitle || "（无）"}
活跃计划：
${generateActivePlanPrompt(activePlanTitles)}

最近的action：
${generateRecentBehaviorPrompt(recentBehaviorList)}

可选咖啡（仅可从中选择）：
${availableCoffeesPrompt}
`;
}
