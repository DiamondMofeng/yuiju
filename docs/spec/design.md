# 技术方案

## 待重构 Action 盘点

运行状态与完成结算能力完成后，后续 Action 应逐步从“开始阶段立即结算”迁移到“开始阶段记录上下文，完成阶段结算结果”。

### 优先重构

这些 Action 当前把持续过程结束后的收益或消耗提前写在 `executor` 中，最适合迁移到 `completionEvent`。

- `Study_At_School`
  - 当前问题：开始上课时立即扣体力、饱腹和心情。
  - 建议调整：`executor` 只设置正在学习；`completionEvent` 在学习结束时结算消耗，并返回放学或学习结束事件。

- `Work_At_Cafe`
  - 当前问题：开始打工时立即发工资，并立即扣体力、饱腹和心情。
  - 建议调整：`executor` 只设置正在打工；`completionEvent` 在打工结束时结算工资和消耗。

- `Walk_In_Park`
  - 当前问题：开始散步时立即增加心情。
  - 建议调整：`executor` 保存本次选择的散步时长档位；`completionEvent` 按开始时保存的档位结算心情收益。

- `Walk_In_Coast`
  - 当前问题：开始散步时立即增加心情。
  - 建议调整：`executor` 保存本次选择的散步时长档位；`completionEvent` 按开始时保存的档位结算心情收益。

- `Pray_At_Shrine`
  - 当前问题：参拜开始时立即结算心情收益。
  - 建议调整：投币属于开始阶段副作用，可以继续保留在 `executor`；心情收益迁移到 `completionEvent` 结算。

### 可后续重构

这些 Action 是短耗时或偏即时行为，迁移收益没有持续型 Action 明显，但为了行为模型一致，可以后续逐步收敛。

- `Eat_Breakfast`
  - 当前问题：开始吃早餐时立即恢复饱腹和体力，并标记今日已吃早餐。
  - 建议调整：`executor` 设置正在吃早餐；`completionEvent` 恢复状态并标记完成。

- `Eat_Lunch`
  - 当前问题：开始吃午饭时立即恢复饱腹和体力，并标记今日已吃午饭。
  - 建议调整：`executor` 设置正在吃午饭；`completionEvent` 恢复状态并标记完成。

- `Eat_Dinner`
  - 当前问题：开始吃晚餐时立即恢复饱腹和体力，并标记今日已吃晚餐。
  - 建议调整：`executor` 设置正在吃晚餐；`completionEvent` 恢复状态并标记完成。

- `Eat_Item`
  - 当前问题：开始吃东西时立即消费物品并恢复状态。
  - 建议调整：消费物品建议保留在开始阶段，避免等待期间物品变化；恢复体力、饱腹和心情可迁移到 `completionEvent`。

- `Drink_Coffee`
  - 当前问题：开始喝咖啡时立即消费咖啡并恢复状态。
  - 建议调整：消费咖啡建议保留在开始阶段；恢复体力、饱腹和心情可迁移到 `completionEvent`。

- `Buy_Item_At_Shop`
  - 当前问题：购买开始时立即扣钱并把商品放入背包。
  - 建议调整：扣钱可保留在开始阶段；如果语义表达为“购买后等待交付”，商品入背包可迁移到 `completionEvent`。如果语义表达为“购买即拿到”，可以暂时保持现状。

- `Order_Coffee`
  - 当前问题：已有 `completionEvent` 表达“咖啡制作完成”，但咖啡在 `executor` 阶段已经进入背包，语义不一致。
  - 建议调整：开始阶段扣钱并记录点单咖啡；`completionEvent` 在制作完成后把咖啡写入背包。

- `Sleep`
  - 当前问题：已有 `completionEvent` 返回闹钟事件，但睡眠恢复效果还没有在完成阶段结算。
  - 建议调整：`executor` 只记录开始睡眠；`completionEvent` 根据实际睡眠时长恢复体力和心情，并返回醒来事件。

- `Sleep_For_A_Little`
  - 当前问题：已有 `completionEvent` 返回闹钟事件，但小睡恢复效果还没有在完成阶段结算。
  - 建议调整：`executor` 只记录开始小睡；`completionEvent` 根据实际小睡时长恢复体力和心情，并返回醒来事件。

### 暂不建议重构

移动类 Action 当前在 `executor` 中直接更新位置。严格来说，位置应在到达时更新，但这会影响场景判断、可执行 Action 列表和移动过程建模，范围较大，建议后续单独设计移动能力。

暂不迁移的移动类 Action：

- `Go_To_School_From_Home`
- `Go_To_Shop_From_Home`
- `Go_To_Cafe_From_Home`
- `Go_To_Park_From_Home`
- `Go_Home_From_School`
- `Go_To_Shop_From_School`
- `Go_To_Cafe_From_School`
- `Go_Home_From_Shop`
- `Go_To_School_From_Shop`
- `Go_To_Coast_From_Shop`
- `Go_To_Shop_From_Coast`
- `Go_Home_From_Park`
- `Go_To_Shrine_From_Park`
- `Go_To_Park_From_Shrine`
- `Go_Home_From_Cafe`
- `Go_To_School_From_Cafe`

### 已基本符合新模式

- `Cook_At_Home`
  - 开始阶段选择并保存食材上下文。
  - 完成阶段读取开始上下文并产出料理。
