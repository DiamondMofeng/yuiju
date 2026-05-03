# 技术方案

## Action 运行状态与完成结算能力

### 要解决的问题

当前 world engine 在一次 tick 中选择 Action 后，会立即执行 Action 副作用，然后进入等待。这个流程适合吃饭、移动、散步等即时结算行为，但难以表达“开始行动、等待过程、完成结算”的行为。

本次要为 Action 增加运行状态与完成结算能力，让做饭这类行为可以：

- 开始时选择并保存上下文，例如选择了哪些食材。
- 开始执行 Action 时写入一条 `behavior` Episode，状态为 `running`。
- 进入等待阶段时，把正在运行的 Action 写入 Redis，支持进程重启后恢复等待。
- 完成时读取开始上下文，不重新选择参数。
- 在 `completionEvent` hook 中根据开始上下文执行完成结算，例如产出料理并写入背包。
- 完成后将同一条 `behavior` Episode 更新为 `completed`。
- 完成后产生事件描述，进入下一次 tick。

第一版优先使用“做饭”验证能力，不新增额外的 MongoDB Action 运行记录，不做通用事件队列和复杂配方系统。

### 修改范围

预计涉及以下模块：

- `packages/utils/src/types/action.ts`
  - 扩展 Action 开始阶段返回值。
  - 扩展 `ActionMetadata.completionEvent`，让它可以在等待结束后执行完成结算并返回事件描述。
- `packages/utils/src/types/state.ts`
  - 扩展 `RunningActionState`，保存开始上下文和 `behaviorEpisodeId`。
- `packages/utils/src/redis.ts`
  - 解析和保存扩展后的 `runningAction`。
- `packages/utils/src/memory/episode.ts`
  - 如当前没有更新 Episode 的入口，新增按 id 更新 `behavior` Episode 的方法。
- `packages/world/src/engine/tick.ts`
  - 从“执行并立即写完成态行为记录”调整为“执行开始阶段并返回待运行 Action”。
- `packages/world/src/engine/runner.ts`
  - 写入 running 状态 Episode、写入 Redis 运行态、等待、执行 `completionEvent` 结算、更新 Episode、清理运行态。
- `packages/world/src/memory/episode-builder.ts`
  - 支持构建 running/completed 两种状态的 `behavior` Episode payload。
- `packages/world/src/action/home.ts`
  - 新增“做饭” Action 作为第一版验证场景。
- `packages/world/src/llm/agent.ts`
  - 如做饭需要由 LLM 选择食材，则新增语义明确的食材选择 agent。

### 核心设计

第一版不新增独立的 MongoDB Action 运行记录。

Action 运行过程直接体现在 `behavior` Episode 上：

- `executor` 开始执行后，写入一条 `behavior` Episode，payload 中标记 `status: "running"`。
- Redis `runningAction` 保存这条 Episode 的 id，以及等待恢复和完成结算所需上下文。
- 等待结束后，`runner` 调用 `completionEvent` hook 完成结算。
- 结算完成后，更新同一条 `behavior` Episode，payload 中标记 `status: "completed"`，并补充完成摘要与产出结果。

这样 MongoDB 中只有一条行为事实记录，不需要额外的 ActionRunRecord。Redis 负责实时运行态，MongoDB 负责可追溯事实。

真相源边界：

- Redis：角色实时状态真相源，保存当前正在运行的 Action、开始上下文和对应的 `behaviorEpisodeId`。
- MongoDB：行为事实归档，`behavior` Episode 记录 Action 从 `running` 到 `completed` 的状态变化。

### Behavior Episode 状态

`MemoryEpisode` 不需要新增顶层字段。Action 状态放在 `behavior` Episode 的 payload 中。

建议 payload 结构：

```ts
{
  action: ActionId;
  status: "running" | "completed";
  reason: string;
  durationMinutes: number;
  startContext?: Record<string, unknown>;
  completionSummary?: string;
  completionContext?: Record<string, unknown>;
  eventDescription?: string;
  location: Location;
  characterStateSnapshot: CharacterStateData;
}
```

字段语义：

- `action`：本次执行的 Action。
- `status`：Action 当前状态，第一版只支持 `running` 和 `completed`。
- `reason`：LLM 选择该 Action 的原因。
- `durationMinutes`：Action 总持续时间。
- `startContext`：完成结算必须读取的开始上下文，例如做饭时选定的食材。
- `completionSummary`：完成阶段的人类可读摘要。
- `completionContext`：完成阶段结构化结果，例如产出的料理。
- `eventDescription`：传给下一次 tick 的事件描述。
- `location`：状态写入时的角色位置。
- `characterStateSnapshot`：状态写入时的角色状态快照。

`summaryText` 在开始时表达“正在执行某 Action”，完成后更新为完整结果摘要。

### Redis 运行态

扩展现有 `RunningActionState`：

```ts
{
  action: ActionId;
  actionStartedAt: string;
  waitUntil: string;
  behaviorEpisodeId: string;
  startContext?: Record<string, unknown>;
}
```

字段语义：

- `action`：当前正在经历等待阶段的 Action。
- `actionStartedAt`：Action 开始执行时间。
- `waitUntil`：等待结束的绝对时间，用于重启后恢复剩余等待。
- `behaviorEpisodeId`：开始阶段写入的 `behavior` Episode id，完成后用它更新同一条记录。
- `startContext`：完成结算必须读取的开始上下文，例如做饭时选定的食材。

Redis 只保存恢复等待和完成结算必须使用的最小数据。`reason`、`durationMinutes` 和人类可读摘要属于历史事实，保存在 MongoDB `behavior` Episode 中，不写入 Redis。

`completionEvent` 不在 tick 阶段提前计算或写入 Redis。它应在等待结束后执行，因为完成结算依赖等待结束这一事实，也可能产生背包、状态和 Episode 更新等副作用。

### Action 类型扩展

保持现有 `executor` 作为开始阶段入口，同时允许它返回结构化开始结果。

建议新增返回类型：

```ts
type ActionStartResult =
  | void
  | string
  | {
      startContext?: Record<string, unknown>;
    };
```

`ActionMetadata.executor` 返回 `ActionStartResult`。

如果返回字符串，该字符串只作为开始阶段的执行结果摘要，用于写入 running Episode 的 `summaryText`，不写入 Redis。

扩展 `ActionMetadata.completionEvent`：

```ts
type ActionCompletionEventResult =
  | void
  | string
  | {
      summary?: string;
      completionContext?: Record<string, unknown>;
      eventDescription?: string;
    };

completionEvent?:
  | string
  | ((
      context: ActionContext,
      runningAction: RunningActionState,
    ) => ActionCompletionEventResult | Promise<ActionCompletionEventResult>);
```

设计约束：

- 普通 Action 可以继续使用静态字符串 `completionEvent`，只表达下一次 tick 的事件描述。
- 需要“开始上下文 + 完成结算”的 Action 使用函数形式 `completionEvent`。
- 函数形式 `completionEvent` 在等待结束后由 `runner` 调用，可以执行状态结算副作用。
- 函数形式 `completionEvent` 必须基于 `runningAction.startContext` 做结算，不重新询问 LLM 选择关键参数。
- 如果返回字符串，该字符串就是下一次 tick 的事件描述，也可作为完成摘要。
- 如果返回对象，`eventDescription` 是下一次 tick 的事件描述，`summary` 和 `completionContext` 用于更新 `behavior` Episode。

### 主流程

#### 开始 Action

`tick()` 主流程调整为：

1. 构建 `ActionContext`。
2. 获取可执行 Action 列表。
3. 由 LLM 选择 Action。
4. 应用 `planChanges`。
5. 调用 `actionMetadata.executor(context, selectedAction)`，执行开始阶段副作用。
6. 更新世界时间。
7. 计算 Action duration。
8. 返回待运行 Action 信息，包括 action、reason、duration 和 startContext。

开始阶段不执行 `completionEvent`。无论 `completionEvent` 是静态字符串还是函数，都由等待结束后的完成流程处理。

#### 写入运行态

`runner` 在拿到 `tick()` 返回结果后：

1. 根据 duration 计算 `waitUntil`。
2. 写入一条 `behavior` Episode，payload.status 为 `running`。
3. 将 Action、actionStartedAt、waitUntil、`behaviorEpisodeId` 和 startContext 写入 Redis `runningAction`。
4. 等待到 `waitUntil`。

这样当进程在等待阶段退出，重启后可以从 Redis 恢复当前运行中的 Action，并通过 `behaviorEpisodeId` 更新同一条 MongoDB 记录。

#### 完成结算

等待结束后，`runner` 执行完成流程：

1. 从 Redis 读取 `runningAction`。
2. 找到对应 `ActionMetadata`。
3. 如果 `completionEvent` 是函数，调用它执行完成结算并获取事件描述。
4. 如果 `completionEvent` 是字符串，直接作为下一次 tick 的事件描述。
5. 使用 `runningAction.behaviorEpisodeId` 更新同一条 `behavior` Episode：
   - 将 payload.status 改为 `completed`。
   - 写入 completionSummary、completionContext 和 eventDescription。
   - 更新完成后的角色状态快照。
   - 更新 summaryText 为完整行为结果。
6. 清理 Redis `runningAction`。
7. 返回事件描述给下一次 tick。

### 做饭验证场景

新增 `ActionId.Cook_At_Home = "做饭"`。

#### 前置条件

第一版建议：

- 角色必须在家。
- 背包中存在可作为食材的物品。

当前项目还没有真正的材料获取系统。如果第一版不新增材料来源，做饭可先使用现有背包中 `category: "food"` 的物品作为食材，以验证完整生命周期能力。

#### 开始阶段

做饭的 `executor`：

1. 设置当前 Action 为“做饭”。
2. 从背包中获取可用食材候选项。
3. 选择本次做饭使用的食材。
4. 消耗选定食材。
5. 返回 `startContext`，保存食材名称、数量和食材 metadata。

示例 `startContext`：

```ts
{
  ingredients: [
    {
      name: "抹茶布丁",
      quantity: 1,
      metadata: {
        satiety: 5,
        mood: 2
      }
    }
  ]
}
```

食材建议在开始阶段消耗。原因是“开始做饭时选择了哪些食材”是本次运行态的一部分，完成阶段应基于这份上下文结算，而不是再受背包后续变化影响。

#### 完成阶段

做饭的 `completionEvent` 函数：

1. 读取 `runningAction.startContext.ingredients`。
2. 根据开始时保存的食材生成料理。
3. 将料理写入角色背包。
4. 返回完成摘要、产出结果和下一次 tick 的事件描述。

第一版不做复杂配方系统，可以使用直白规则：

- 单个食材：产出 `${食材名}料理`。
- 多个食材：产出 `家常料理`。
- 料理的恢复值基于食材 metadata 做简单汇总。

示例完成结果：

```ts
{
  summary: "用抹茶布丁做出了一份抹茶布丁料理",
  completionContext: {
    producedItem: {
      name: "抹茶布丁料理",
      quantity: 1
    }
  },
  eventDescription: "料理做好了"
}
```

### 行为 Episode 写入与更新

开始阶段写入 running 状态 Episode：

- `type: "behavior"`。
- `summaryText` 表达“悠酱开始执行行为「做饭」”。
- `payload.status: "running"`。
- payload 中保存 action、reason、duration、startContext、开始时位置和开始时角色状态快照。

完成阶段更新同一条 Episode：

- `payload.status` 更新为 `"completed"`。
- payload 中补充 completionSummary、completionContext、eventDescription 和完成后的角色状态快照。
- `summaryText` 更新为完整行为结果，例如“悠酱完成了行为「做饭」；用抹茶布丁做出了一份抹茶布丁料理；持续时间：30 分钟”。

这样日记和记忆系统能看到 Action 的完整事实，同时调试时也能看到等待中的 Action 处于 running 状态。

### 副作用边界

开始阶段副作用：

- Redis：更新 `characterState.action`。
- Redis：做饭时消耗选定食材。
- MongoDB：写入 `running` 状态的 `behavior` Episode。
- Redis：写入 `runningAction`，包含 `behaviorEpisodeId` 和 startContext。

等待阶段副作用：

- 无业务状态变化，只等待真实时间。

完成阶段副作用：

- Redis：读取 `runningAction`。
- Redis：写入产出料理到背包。
- MongoDB：更新同一条 `behavior` Episode 为 `completed`。
- Redis：清理 `runningAction`。

### 失败处理

第一版不做失败补偿和回滚。

原则：

- 如果开始阶段失败，不写 `behavior` Episode，不写 Redis `runningAction`，不进入等待。
- 如果写入 running Episode 失败，不写 Redis `runningAction`，不进入等待。
- 如果写 Redis `runningAction` 失败，保留 running Episode 用于排查，但本次 Action 不进入等待。
- 如果完成结算失败，记录错误日志，保留 Redis `runningAction`，避免直接丢失可恢复上下文。
- 如果更新 `behavior` Episode 为 completed 失败，记录错误日志，保留 Redis `runningAction`，避免 MongoDB 状态和 Redis 状态直接失联。

### 不在本次范围

第一版明确不处理：

- 独立的 MongoDB ActionRunRecord 表。
- 通用世界事件队列。
- Action 中断与取消。
- 失败补偿和回滚。
- 复杂配方系统。
- 多角色并行行动。
- 场景状态系统。
- 大范围重构现有 Action。
- 新增分散配置项或隐式运行约定。

### 验证方式

实现完成后执行：

```bash
pnpm run format:write
pnpm run lint
pnpm run type-check
```

做饭场景需要验证：

- 开始时能选择并保存食材。
- 开始后 MongoDB 中存在 `status: "running"` 的 `behavior` Episode。
- 等待阶段 Redis 中存在 `runningAction`。
- Redis `runningAction` 中包含 `behaviorEpisodeId` 和开始时保存的食材上下文。
- 完成时读取的是开始时保存的食材，不重新选择。
- 完成后背包中新增料理。
- 完成后同一条 `behavior` Episode 更新为 `status: "completed"`，并包含产出结果。
- 完成后 Redis `runningAction` 被清理。
- `completionEvent` 返回的事件描述能进入下一次 tick。

### 待确认问题

- 做饭第一版是否使用现有 `category: "food"` 背包物品作为食材。
- 食材是否在开始阶段立即消耗。当前方案建议开始时消耗。
