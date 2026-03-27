import { generateText, stepCountIs } from "ai";
import { strongModel } from "@yuiju/utils";

const WORLD_MAP_DSL = `
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

const QUESTIONS = [
  "从「家」到「学校」的最短耗时路径是什么？请按 A->B->C 的格式输出，并给出总耗时。",
  "从「学校」到「医院」，第一步应该去哪里？",
  "「商店」到「咖啡店」的方位方向是什么？",
  "从「车站」到「公园」的最短耗时路径是什么？",
];

export async function main() {
  const prompt = [
    "你需要理解下面的世界地图 DSL，并回答问题。",
    "",
    "DSL 说明：",
    '- place 定义地点：place <ID> "名称"',
    "- link 定义连接：link <FROM> -> <TO> (t=分钟, s=体力变化, dir=方位)",
    "- 移动只能沿 link 进行；若目标非相邻，需要多步路径。",
    "",
    "地图 DSL：",
    WORLD_MAP_DSL,
    "",
    "问题：",
    "学校在家的哪个方向？",
  ].join("\n");

  const result = await generateText({
    model: strongModel,
    prompt,
    stopWhen: stepCountIs(10),
  });

  console.log("\n=== WORLD MAP DSL ===\n");
  console.log(WORLD_MAP_DSL);
  console.log("\n=== QUESTIONS ===\n");
  QUESTIONS.forEach((q, index) => {
    console.log(`${index + 1}. ${q}`);
  });
  console.log("\n=== LLM ANSWER ===\n");
  console.log(result.text);
}
