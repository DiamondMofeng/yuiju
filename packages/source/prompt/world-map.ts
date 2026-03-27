export const worldMapDsl = `
place HOME "家"
place SCHOOL "学校"
place SHOP "商店"
place CAFE "咖啡店"

link HOME -> SCHOOL (timeMinutes=30, stamina=-7, satiety=-4, dir=N)
link SCHOOL -> HOME (timeMinutes=30, stamina=-7, satiety=-4, dir=S)

link HOME -> SHOP (timeMinutes=20, stamina=-5, satiety=-3, dir=NE)
link SHOP -> HOME (timeMinutes=20, stamina=-5, satiety=-3, dir=SW)

link HOME -> CAFE (timeMinutes=20, stamina=-5, satiety=-3, dir=NW)
link CAFE -> HOME (timeMinutes=20, stamina=-3, dir=SE)

link SCHOOL -> SHOP (timeMinutes=10, stamina=-3, satiety=-2, dir=E)
link SHOP -> SCHOOL (timeMinutes=10, stamina=-3, satiety=-2, dir=W)

link SCHOOL -> CAFE (timeMinutes=10, stamina=-3, satiety=-2, dir=W)
link CAFE -> SCHOOL (timeMinutes=10, stamina=-3, satiety=-2, dir=E)
`.trim();

export const worldMapTerminalUi = `
          ┌────────┐
          │  学校  │
          └───┬────┘
              │
      ┌───────┼───────┐
  ┌───┴───┐   │   ┌───┴───┐
  │ 咖啡店 │   │   │  商店  │
  └───┬───┘   │   └───┬───┘
      └───────┼───────┘
              │
          ┌───┴────┐
          │   家   │
          └────────┘
`;

export const worldMapPrompt = `
### 世界地图（结构化）
下面给出「星见町」已知地点的地图信息，包含地点关系与方位。

#### DSL 语法说明
- place：定义一个地点节点
  - 格式：place <PLACE_ID> "<PLACE_NAME>"
  - PLACE_ID：地点的稳定标识（用于 link 引用），例如 HOME/SCHOOL
  - PLACE_NAME：地点展示名，例如「家」
- link：定义一个“从 FROM 到 TO”可移动的有向边
  - 格式：link <FROM> -> <TO> (timeMinutes=分钟数, stamina=体力变化, satiety=饱腹变化, dir=方位)
  - timeMinutes：移动耗时（单位：分钟）
  - stamina：移动对体力的影响（负数表示消耗，正数表示恢复）
  - satiety：移动对饱腹的影响（负数表示降低，正数表示增加）
  - dir：从 FROM 看向 TO 的方位（N/NE/E/SE/S/SW/W/NW）

#### DSL
${worldMapDsl}
`.trim();
