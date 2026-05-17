# 技术方案

## Satori Runtime 接入第一阶段

### 当前状态

项目已经完成 Satori 接入前置验证：

- `@yuiju/message` 已有 Satori demo，可以在同一个 `Context` 中同时注册 Lark 和 OneBot。
- 飞书使用官方 `@satorijs/adapter-lark`。
- QQ / NapCat 使用项目内维护的 `@yuiju/satorijs-adapter-onebot`。
- 项目配置已从 `message.napcat` 调整为 `message.onebot`，并新增 `message.lark`。
- `message.onebot.whiteList` 和 `message.onebot.groupWhiteList` 已经收口到 OneBot 平台配置下。

第一阶段的重点不再是验证 Satori 能否启动，而是把 `@yuiju/message` 的群聊主流程从旧的 `node-napcat-ts` / OneBot v11 消息结构迁移到 Satori runtime 和 Satori Message Element。

### 目标

第一阶段目标：

- `@yuiju/message` 正式启动 Satori runtime。
- 在同一个 Satori `Context` 中注册 OneBot 和 Lark。
- 将 QQ 群聊主流程迁移到 Satori `Session` / `Message` / `Element`。
- 让现有 QQ 群聊接收、会话历史、LLM 判断、回复发送和回复记录保持可用。
- 去掉业务代码中的确定性 at / reply 指向判断，让 LLM 根据消息体和历史上下文自行判断是否回复。
- 建立一套面向 Satori Element 的消息渲染边界，后续飞书真实群聊复用同一条业务主流程。

第一阶段不是：

- 不是自己实现 Satori 协议。
- 不是把 `@yuiju/message` 暴露为对外 Satori server。
- 不是一次性迁移私聊、戳一戳和主动消息。
- 不是建立跨平台用户绑定关系。

### 核心取舍

第一阶段删除独立的 at / reply 指向判断。

旧流程中，群聊 handler 会先判断消息是否直接面向悠酱：

- 是否 at 机器人账号。
- 是否引用回复机器人消息。

然后把 `at` 或 `reply` 作为额外字段传给 LLM。

新流程中，业务代码不再调用 `isGroupMessageDirectedToBot`，也不再向 LLM prompt 传入 `latestMessageDirectedType`。Satori adapter 负责产出结构化消息元素，业务层在进入 LLM 前把第一阶段支持的元素渲染成自然可读内容，例如：

- `你好 @悠酱`
- `[图片：一张猫趴在桌上的表情包]`

LLM 根据当前消息体、群聊历史和回复规则自行判断是否需要回复。

这样做的好处是：

- 群聊 handler 少一个平台相关判断分支。
- 第一阶段不需要设计跨平台 `isDirectedToBot` 结果。
- 第一阶段不需要补齐所有引用消息查询能力。
- at 语义仍通过消息内容进入 LLM，不丢失上下文。

需要接受的边界是：

- 是否回复更依赖 LLM，而不是业务代码的确定性布尔值。
- prompt 要明确告诉 LLM：群聊中只有在消息自然面向悠酱、at 悠酱或上下文确实需要回应时才回复。
- 如果后续误回复明显增加，再单独评估是否恢复轻量确定性前置判断。

### Runtime 边界

第一阶段由 `@yuiju/message` 进程直接运行 Satori runtime：

1. 创建 Satori `Context`。
2. 注册 `HTTP`。
3. 注册 `@satorijs/adapter-lark`。
4. 注册 `@yuiju/satorijs-adapter-onebot`。
5. 监听 `message` 事件。
6. 将 Satori `Session` 交给群聊 handler。

Satori runtime 是平台事件和发送能力的事实源。

Satori `Session` / `Message` / `Element` 是消息模型事实源。

渲染后的 content 字符串只服务 LLM、记忆材料和日志展示，不作为新的消息事实源。

### 消息模型

第一阶段新增项目内部的 Satori 存储消息结构，用于替代旧的 `StoredGroupMessage` / `StoredPrivateMessage` 在群聊主链路中的职责。

建议结构保留这些业务字段：

- `scene`：`group` 或 `private`，第一阶段主要使用 `group`。
- `platform`：Satori 平台名，例如 `onebot`、`lark`。
- `messageId`：平台消息 ID，统一为字符串。
- `channelId`：Satori channel id。
- `guildId`：Satori guild id，可选。
- `sessionId`：内部会话 key，群聊建议为 `group:${platform}:${channelId}`。
- `sessionLabel`：群聊或会话展示名。
- `sender`：发送者信息，包含 id、展示名、是否机器人自己。
- `timestamp`：毫秒时间戳。
- `elements`：Satori Message Element。
- `content`：由 `elements` 渲染出的 LLM / 记忆可读文本。
- `rawSession`：必要时保留 Satori session，仅用于调试和少量平台补全，不进入业务判断主路径。

这个结构不是一套新的协议模型，而是对 Satori 消息事实的业务投影。

### Element 范围

第一阶段先覆盖现有 QQ 群聊链路需要的消息语义：

- `text`：普通文本。
- `at`：at 用户，渲染为可读昵称；如果 at 机器人自己，应渲染为悠酱。
- `image`：图片或表情包，继续沿用现有图片描述能力。
- `face`：QQ 表情，保留可读描述。

`quote` 引用回复语义第一阶段先不映射到业务消息模型，也不渲染给 LLM。等 Satori runtime 主流程、群聊历史、回复记录和记忆迁移完成后，再单独处理引用消息语义。

### 主流程

第一阶段群聊主流程调整为：

1. `@yuiju/message` 启动 Satori runtime。
2. Satori runtime 通过 OneBot adapter 接收 QQ 群消息。
3. Handler 判断消息是否来自允许的 OneBot 群。
4. Handler 将 Satori session 投影为内部 Satori 存储消息。
5. Handler 将消息写入当前群聊会话上下文。
6. Handler 根据角色状态判断是否允许回复。
7. Handler 调用 LLM 判断是否回复并生成回复内容。
8. Handler 通过 `session.bot.sendMessage()` 发送回复。
9. Handler 将机器人回复按 Satori 消息模型写入同一会话历史。

主流程不再调用 `isGroupMessageDirectedToBot`。

主流程不再向 LLM 传入 `latestMessageDirectedType`。

### 预计修改范围

第一阶段预计修改：

- `docs/spec/design.md`
  - 更新当前方案和阶段边界。

- `packages/message/src/server.ts`
  - 从旧 `NCWebsocket` 入口切换为 Satori runtime。
  - 注册 Lark 和 OneBot adapter。
  - 将 Satori `message` 事件交给群聊 handler。

- `packages/message/src/handler/group-message.ts`
  - 入参改为 Satori session。
  - 使用 `config.message.onebot.groupWhiteList` 判断 OneBot 群白名单。
  - 删除 at / reply 指向判断。
  - 保留关闭群聊、记录历史、睡眠检查、LLM 决策、发送回复的顺序。

- `packages/message/src/utils/message.ts`
  - 新增 Satori session 到内部存储消息的投影逻辑。
  - 新增 Satori Element 到 LLM / 记忆可读文本的渲染逻辑。
  - 保留图片描述、at 展示名等已有能力。
  - 旧 OneBot segment 增强逻辑可以先保留，直到私聊、主动消息和 internal API 完成迁移。

- `packages/message/src/utils/reply.ts`
  - 群聊回复改为通过 Satori session 发送。
  - 机器人回复记录不再依赖 NapCat `get_msg` 回读。
  - 私聊和主动群消息旧函数暂时保留。

- `packages/message/src/llm/manager.ts`
  - 群聊 session key 改为基于 `platform + channelId`。
  - 群聊 requestId 改为字符串。
  - 群聊 prompt 不再写死 QQ 群。
  - 删除 `directedType` 参数。

- `packages/message/src/llm/chat-session-manager.ts`
  - 泛型消息类型改为新的 Satori 存储消息结构。
  - 历史构建读取内部 Satori 消息投影。

- `packages/message/src/memory/person-memory.ts`
  - 读取新的 Satori 存储消息结构。
  - 继续以昵称作为人物记忆主键。

- `packages/message/src/memory/episode-builder.ts`
  - 对话 Episode 使用新的 Satori 消息字段构建 payload。

### 暂不修改范围

第一阶段暂不处理：

- 不迁移 `internal-api.ts` 的主动群消息发送。
- 不迁移 `notice-poke.ts`。
- 不完整迁移私聊策略。
- 不改造表情包配置来源。
- 不迁移历史人物记忆文件。
- 不建立跨平台用户绑定关系。
- 不设计跨平台主动消息目标配置。
- 不处理 `quote` 引用回复语义映射。
- 不删除旧 NapCat 工具函数，除非它们已经没有调用点。

### 兼容边界

第一阶段完成后，QQ 群聊主流程应走 Satori。

旧 NapCat 相关代码可以在未迁移功能中继续存在，但不能再作为群聊主流程事实源。

如果某个旧能力仍依赖 `NCWebsocket`，应明确留在暂不修改范围内，而不是在 Satori 主流程中偷偷做 OneBot 配置到 NapCat 配置的转换。

### 验证方式

第一阶段完成后需要验证：

- `pnpm run format:write`
- `pnpm run lint`
- `pnpm run type-check`
- QQ 群聊消息可以正常进入 Satori handler。
- 普通群聊消息由 LLM 自行判断是否回复。
- at 悠酱的群消息能在 LLM 可见内容中体现 at 语义。
- 悠酱发送的回复会被记录回同一会话历史。
- 人物记忆更新仍保持昵称主键行为。
- 旧私聊、戳一戳、主动消息能力未被本阶段误改。
