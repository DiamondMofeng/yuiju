# Action 模块

## 模块概述

定义悠酱可以执行的所有行为（Action）。每个行为包含前置条件、执行逻辑、持续时间等元数据。LLM 通过分析当前状态和可用行为列表，选择最合适的行为执行。

## 文件结构

```
action/
├── index.ts          # 行为获取入口，根据角色位置返回可用行为列表
├── home.ts           # 家中场景行为（起床、吃饭、睡觉等）
├── school.ts         # 星见丘高校场景行为（上课、放学等）
├── shop.ts           # 小町商店场景行为（购物、移动等）
├── coast.ts          # 月汐海岸场景行为（散步、返回小町商店等）
├── anywhere.ts       # 通用行为（发呆、吃食物等）
└── utils.ts          # 工具函数（时间判断、前置条件检查等）
```

## 核心概念

### ActionMetadata

行为的完整定义，类型定义见 [types/action.ts](../../../utils/src/types/action.ts)。

核心字段：

- `action: ActionId` - 行为 ID 枚举值
- `description: string` - 行为描述（传给 LLM 作为决策依据）
- `precondition: (context) => boolean` - 前置条件函数，返回 false 时该行为不可用
- `executor: (context, selectedAction) => void` - 执行器，接收本次 Action 决策结果并修改角色状态
- `durationMin: number | function` - 持续时间（分钟），支持基于本次决策结果做动态计算
- `completionEvent?: string | function` - 完成事件描述，作为下次 LLM 决策的上下文

### 行为决策流程

[index.ts:8-30](index.ts#L8-L30) 的 `getActionList()` 函数实现行为过滤：

1. **预检查特殊状态** - 如睡眠中只允许"起床"或"再睡一会"（[utils.ts:10-16](utils.ts#L10-L16)）
2. **加载场景行为** - 根据当前位置（Home/School/Shop/月汐海岸等，例如星见丘高校、小町商店）加载场景特定行为
3. **合并并过滤** - 合并通用行为，通过 `precondition` 过滤可用行为

### 决策结果驱动行为

某些行为需要读取 LLM 在本次 Action 决策阶段产出的附加信息，例如动态时长。

实现步骤：

1. 在 `ActionAgentDecision` 中定义需要的决策字段
2. 在 `executor` / `durationMin` 中读取 `selectedAction`

参考：[park.ts](park.ts) 的“逛南风公园”行为

### 前置条件工具

[utils.ts](utils.ts) 提供常用判断函数：

- **时间判断**：`isMorning`、`isAfternoon`、`isEvening`、`isNight`、`isWeekday`、`isWeekend`
- **行为状态**：`isDoing`、`isNotDoing`、`notDoneToday`
- **条件组合**：使用 `@yuiju/utils` 的 `allTrue` 函数组合多个条件

## 添加新行为

1. 在 [types/action.ts](../../../utils/src/types/action.ts) 添加 `ActionId` 枚举
2. 在对应场景文件（home.ts/school.ts/anywhere.ts）定义行为
3. 如需动态决策结果，在 `ActionAgentDecision` 中补充字段
4. 在 `executor` 中实现状态修改逻辑

### 添加新地点

新增地点时，除了补对应场景文件外，还需要同步以下位置：

1. 在 `@yuiju/utils` 的 `types/state.ts` 中补充地点枚举与 `Location` 联合类型
2. 在 `@yuiju/utils` 的 `types/action.ts` 中补充该地点的移动/交互行为 ID
3. 在 `action/index.ts` 中接入场景行为分发
4. 在 `@yuiju/utils` 的 `prompt/world-map.ts` 中更新地图事实源与路径关系

## 重要说明

- executor 中的状态修改会自动保存到 Redis，无需手动调用 `save()`
- 持续时间单位统一为"分钟"
- `completionEvent` 为 LLM 提供上下文连续性
- 前置条件会在每个 tick 被调用，避免执行耗时操作

## 相关文件

- [types/action.ts](../../../utils/src/types/action.ts) - 行为相关类型定义
- [state/charactor-state.ts](../state/charactor-state.ts) - 角色状态管理
- [engine/tick.ts](../engine/tick.ts) - 行为执行循环
- [llm/llm-client.ts](../llm/llm-client.ts) - LLM 决策客户端
