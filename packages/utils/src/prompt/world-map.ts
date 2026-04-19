import { MajorScene } from "../types/state";

export type WorldMapPlaceId = "HOME" | "SCHOOL" | "SHOP" | "CAFE" | "PARK" | "SHRINE" | "COAST";

export interface WorldMapPlace {
  id: WorldMapPlaceId;
  name: string;
}

export interface WorldMapLink {
  from: WorldMapPlaceId;
  to: WorldMapPlaceId;
  timeMinutes: number;
  stamina: number;
  satiety?: number;
  dir: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
}

const VALID_DIRECTIONS = new Set<WorldMapLink["dir"]>(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

const PLACE_LINE_PATTERN = /^place\s+([A-Z_]+)\s+"(.+)"$/;
const LINK_LINE_PATTERN = /^link\s+([A-Z_]+)\s+->\s+([A-Z_]+)\s+\((.+)\)$/;

export interface CompiledWorldMap {
  places: WorldMapPlace[];
  links: WorldMapLink[];
}

function parseInteger(value: string, fieldName: string, line: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[world-map] invalid ${fieldName} in line: ${line}`);
  }
  return parsed;
}

/**
 * 将 world-map DSL 编译为结构化数据。
 *
 * 说明：
 * - 把 DSL 作为地图单一事实源，供 web / tool / prompt 复用；
 * - 编译阶段做字段与引用校验，尽量在启动时暴露配置错误。
 */
export function compileWorldMapDsl(dsl: string): CompiledWorldMap {
  const places: WorldMapPlace[] = [];
  const links: WorldMapLink[] = [];
  const placeIdSet = new Set<WorldMapPlaceId>();

  const lines = dsl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const placeMatch = line.match(PLACE_LINE_PATTERN);
    if (placeMatch) {
      const [, rawId, name] = placeMatch;
      const id = rawId as WorldMapPlaceId;
      placeIdSet.add(id);
      places.push({ id, name });
      continue;
    }

    const linkMatch = line.match(LINK_LINE_PATTERN);
    if (linkMatch) {
      const [, rawFrom, rawTo, rawDetails] = linkMatch;
      const from = rawFrom as WorldMapPlaceId;
      const to = rawTo as WorldMapPlaceId;
      const details = Object.fromEntries(
        rawDetails
          .split(",")
          .map((item) => item.trim())
          .map((item) => item.split("="))
          .map(([key, value]) => [key, value]),
      );

      const dir = details.dir as WorldMapLink["dir"];
      if (!VALID_DIRECTIONS.has(dir)) {
        throw new Error(`[world-map] invalid dir "${details.dir}" in line: ${line}`);
      }

      const stamina = parseInteger(details.stamina ?? "", "stamina", line);
      const timeMinutes = parseInteger(details.timeMinutes ?? "", "timeMinutes", line);
      const satiety =
        typeof details.satiety === "string"
          ? parseInteger(details.satiety, "satiety", line)
          : undefined;

      links.push({
        from,
        to,
        dir,
        stamina,
        timeMinutes,
        satiety,
      });
      continue;
    }

    throw new Error(`[world-map] unsupported DSL line: ${line}`);
  }

  for (const link of links) {
    if (!placeIdSet.has(link.from) || !placeIdSet.has(link.to)) {
      throw new Error(`[world-map] link references unknown place: ${link.from} -> ${link.to}`);
    }
  }

  return { places, links };
}

export const worldMapDsl = `
place HOME "${MajorScene.Home}"
place SCHOOL "${MajorScene.School}"
place SHOP "${MajorScene.Shop}"
place CAFE "${MajorScene.Cafe}"
place PARK "${MajorScene.Park}"
place SHRINE "${MajorScene.Shrine}"
place COAST "${MajorScene.Coast}"

link HOME -> SCHOOL (timeMinutes=30, stamina=-7, satiety=-4, dir=N)
link SCHOOL -> HOME (timeMinutes=30, stamina=-7, satiety=-4, dir=S)
link HOME -> SHOP (timeMinutes=20, stamina=-5, satiety=-3, dir=NE)
link SHOP -> HOME (timeMinutes=20, stamina=-5, satiety=-3, dir=SW)
link HOME -> CAFE (timeMinutes=20, stamina=-5, satiety=-3, dir=NW)
link CAFE -> HOME (timeMinutes=20, stamina=-3, dir=SE)
link SCHOOL -> SHOP (timeMinutes=10, stamina=-3, satiety=-2, dir=E)
link SHOP -> SCHOOL (timeMinutes=10, stamina=-3, satiety=-2, dir=W)
link SCHOOL -> CAFE (timeMinutes=10, stamina=-3, satiety=-2, dir=W)
link CAFE -> SCHOOL (timeMinutes=10, stamina=-3, dir=E)
link HOME -> PARK (timeMinutes=10, stamina=-2, satiety=-1, dir=S)
link PARK -> HOME (timeMinutes=10, stamina=-2, satiety=-1, dir=N)
link PARK -> SHRINE (timeMinutes=10, stamina=-2, satiety=-1, dir=S)
link SHRINE -> PARK (timeMinutes=10, stamina=-2, satiety=-1, dir=N)
link SHOP -> COAST (timeMinutes=30, stamina=-2, satiety=-1, dir=E)
link COAST -> SHOP (timeMinutes=30, stamina=-2, satiety=-1, dir=W)
`.trim();

const compiledWorldMap = compileWorldMapDsl(worldMapDsl);
export const worldMapPlaces: WorldMapPlace[] = compiledWorldMap.places;
export const worldMapLinks: WorldMapLink[] = compiledWorldMap.links;

/**
 * 给人看的，不是给 LLM 看的
 */
export const worldMapTerminalUi = `
             ┌────────────┐
             │ 星见丘高校 │
             └─────┬──────┘
                   │
      ┌────────────┼────────────────────────────┐
  ┌───┴────────┐   │                  ┌─────────┴───┐──────┌──────────┐
  │ 薄暮咖啡馆 │   │                  │   小町商店   │      │ 月汐海岸 │
  └───┬────────┘   │                  └─────────┬───┘──────└──────────┘
      └────────────┼────────────────────────────┘
                   │
               ┌───┴────┐
               │   家   │
               └───┬────┘
                   │
               ┌───┴────┐
               │ 南风公园 │
               └───┬────┘
                   │
               ┌───┴────┐
               │ 结灯神社 │
               └─────────┘
`.trim();
