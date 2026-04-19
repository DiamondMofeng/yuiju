"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HomeMapCardProps = {
  location?: string;
};

type MapPlace = {
  id: string;
  name: string;
};

type MapLink = {
  from: string;
  to: string;
  timeMinutes: number;
  stamina: number;
  satiety?: number;
  dir: string;
};

type HomeMapResponse = {
  code: number;
  message: string;
  data?: {
    places?: MapPlace[];
    links?: MapLink[];
    terminalUi?: string;
  };
};

type MapNode = {
  id: string;
  name: string;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildMapNodes(places: MapPlace[], terminalUi?: string): MapNode[] {
  if (places.length === 0) {
    return [];
  }

  const lines = (terminalUi ?? "").split("\n");
  const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 1);

  const nodesFromUi = places
    .map((place) => {
      const lineIndex = lines.findIndex((line) => line.includes(place.name));
      if (lineIndex < 0) return null;

      const columnIndex = lines[lineIndex].indexOf(place.name);
      const x = clamp((columnIndex / Math.max(1, maxLineLength - 1)) * 80 + 10, 10, 92);
      const y = clamp((lineIndex / Math.max(1, lines.length - 1)) * 76 + 12, 12, 90);

      return {
        id: place.id,
        name: place.name,
        x,
        y,
      } satisfies MapNode;
    })
    .filter((node): node is MapNode => node !== null);

  if (nodesFromUi.length === places.length) {
    return nodesFromUi;
  }

  const existingIds = new Set(nodesFromUi.map((node) => node.id));
  const missingPlaces = places.filter((place) => !existingIds.has(place.id));

  const fallbackNodes = missingPlaces.map((place, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, missingPlaces.length);
    return {
      id: place.id,
      name: place.name,
      x: 50 + Math.cos(angle) * 30,
      y: 50 + Math.sin(angle) * 28,
    } satisfies MapNode;
  });

  return [...nodesFromUi, ...fallbackNodes];
}

export function HomeMapCard({ location }: HomeMapCardProps) {
  const currentLocation = location ?? "";
  const [selectedId, setSelectedId] = useState<string>("");
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data } = useSWR("/api/nodejs/home/map", async () => {
    const response = await fetch("/api/nodejs/home/map", { cache: "no-store" });
    if (!response.ok) {
      return undefined;
    }
    const payload = (await response.json()) as HomeMapResponse;
    return payload.data;
  });

  const places = data?.places ?? [];
  const links = data?.links ?? [];
  const mapNodes = useMemo(
    () => buildMapNodes(places, data?.terminalUi),
    [places, data?.terminalUi],
  );
  const hasMapNodes = mapNodes.length > 0;

  const nodeById = useMemo(() => {
    return new Map(mapNodes.map((node) => [node.id, node]));
  }, [mapNodes]);

  const nodeByName = useMemo(() => {
    return new Map(mapNodes.map((node) => [node.name, node]));
  }, [mapNodes]);

  useEffect(() => {
    if (!hasMapNodes) return;

    const currentNode = nodeByName.get(currentLocation);
    if (currentNode) {
      setSelectedId((prev) => prev || currentNode.id);
      return;
    }

    if (!nodeById.has(selectedId)) {
      setSelectedId(mapNodes[0]?.id ?? "");
    }
  }, [currentLocation, hasMapNodes, mapNodes, nodeById, nodeByName, selectedId]);

  useEffect(() => {
    if (!isZoomOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsZoomOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isZoomOpen]);

  useEffect(() => {
    if (!isDetailOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDetailOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDetailOpen]);

  const selectedNode = useMemo(() => {
    if (!hasMapNodes) return undefined;

    return nodeById.get(selectedId) ?? nodeByName.get(currentLocation) ?? mapNodes[0];
  }, [currentLocation, hasMapNodes, mapNodes, nodeById, nodeByName, selectedId]);

  const mapEdges = useMemo(() => {
    const allEdges = links
      .map((link) => {
        const from = nodeById.get(link.from);
        const to = nodeById.get(link.to);
        if (!from || !to) return null;

        const key = [link.from, link.to].sort().join("-");
        return { key, from, to };
      })
      .filter((edge): edge is { key: string; from: MapNode; to: MapNode } => edge !== null);

    return allEdges.filter((edge, index, list) => {
      return list.findIndex((item) => item.key === edge.key) === index;
    });
  }, [links, nodeById]);

  const selectedConnections = useMemo(() => {
    if (!selectedNode) return [];

    return links
      .filter((link) => link.from === selectedNode.id || link.to === selectedNode.id)
      .map((link) => {
        const targetId = link.from === selectedNode.id ? link.to : link.from;
        const targetName = nodeById.get(targetId)?.name ?? targetId;
        return `${targetName} · ${link.timeMinutes}分钟`;
      });
  }, [links, nodeById, selectedNode]);

  const mapStage = (variant: "default" | "zoom") => {
    if (!hasMapNodes) {
      return (
        <section
          className={cn(
            "relative flex-1 min-h-[420px] rounded-2xl border border-[rgba(217,230,245,0.9)] bg-white/85 overflow-hidden grid place-items-center",
            variant === "zoom" && "min-h-[520px] h-full",
          )}
          aria-label="二维地图"
        >
          <span className="text-[13px] text-[#6b7480]">暂无地图数据</span>
        </section>
      );
    }

    return (
      <section
        className={cn(
          "relative flex-1 min-h-[420px] rounded-2xl border border-[rgba(217,230,245,0.9)] bg-white/85 overflow-hidden",
          "before:absolute before:inset-0 before:content-[''] before:pointer-events-none before:opacity-[0.18]",
          "before:bg-[linear-gradient(rgba(217,230,245,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(217,230,245,0.55)_1px,transparent_1px)]",
          "before:bg-size-[56px_56px]",
          variant === "zoom" && "min-h-[520px] h-full",
        )}
        aria-label="二维地图"
      >
        <svg
          className="absolute inset-0 h-full w-full z-1 pointer-events-none"
          viewBox="0 0 100 100"
        >
          <title>地图连线</title>
          {mapEdges.map((edge) => (
            <line
              key={edge.key}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke="rgba(145,196,238,0.9)"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          ))}
        </svg>

        {mapNodes.map((node) => {
          const isActive = node.name === currentLocation;
          const isSelected = node.id === selectedNode?.id;
          return (
            <div
              key={node.id}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 w-max min-w-[126px] max-w-[calc(100%-12px)] z-[2] max-[520px]:min-w-[108px]",
                isActive && "z-5",
              )}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <button
                className={cn(
                  "rounded-[18px] border border-[rgba(217,230,245,0.9)] bg-white shadow-[0_10px_25px_rgba(21,33,54,0.06)] px-3 py-2 inline-flex items-center justify-center gap-2 transition duration-150 cursor-pointer appearance-none",
                  "hover:-translate-y-[1px]",
                  isActive &&
                    "border-[rgba(175,122,197,0.55)] bg-[#f2e8f7] shadow-[0_18px_40px_rgba(175,122,197,0.18)]",
                  isSelected &&
                    "border-[rgba(145,196,238,0.55)] shadow-[0_16px_35px_rgba(145,196,238,0.22)]",
                )}
                type="button"
                onClick={() => {
                  setSelectedId(node.id);
                  setIsDetailOpen(true);
                }}
                aria-pressed={isSelected}
                aria-haspopup="dialog"
              >
                <span className="font-black text-sm tracking-[0.2px] text-center whitespace-nowrap">
                  {node.name}
                </span>
                <span
                  className={cn(
                    "justify-self-center border border-[rgba(217,230,245,0.85)] bg-white/95 text-[#6b7480] text-[11px] leading-none px-2 py-1 rounded-full whitespace-nowrap",
                    isActive &&
                      "border-[rgba(145,196,238,0.45)] bg-[rgba(145,196,238,0.2)] text-[rgba(43,47,54,0.9)]",
                  )}
                >
                  {isActive ? "当前" : "地点"}
                </span>
              </button>
            </div>
          );
        })}
      </section>
    );
  };

  return (
    <Card>
      <div className="p-[14px] grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-[14px] font-black tracking-[0.2px]">世界地图</h3>
          <div className="inline-flex items-center justify-end gap-2.5 flex-wrap">
            <Badge variant="pill" size="default" className="whitespace-nowrap">
              <span className="text-[#6b7480]">当前位置</span>&nbsp;
              <strong className="text-[#2b2f36]">{currentLocation || "—"}</strong>
            </Badge>
            <Button
              variant="outline"
              size="icon"
              type="button"
              aria-label="放大地图"
              onClick={() => setIsZoomOpen(true)}
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 5H6a1 1 0 0 0-1 1v3M15 5h3a1 1 0 0 1 1 1v3M9 19H6a1 1 0 0 1-1-1v-3M15 19h3a1 1 0 0 0 1-1v-3"
                  stroke="rgba(43,47,54,0.9)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 min-h-0">{mapStage("default")}</div>
      </div>

      {isZoomOpen ? (
        <div className="fixed inset-0 bg-[rgba(15,22,30,0.35)] grid items-center justify-items-center p-4 z-[45]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="关闭放大地图"
            onClick={() => setIsZoomOpen(false)}
          />
          <section
            className="relative w-[min(980px,96vw)] h-[min(720px,92vh)] bg-white/97 border border-[rgba(217,230,245,0.9)] rounded-[20px] shadow-[0_22px_45px_rgba(15,22,30,0.18)] grid grid-rows-[auto_1fr] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="放大地图"
          >
            <header className="flex items-center justify-between gap-3 px-4 py-[14px] border-b border-[rgba(217,230,245,0.85)]">
              <div>
                <h3 className="m-0 text-base font-black">世界地图 · 放大查看</h3>
                <p className="mt-1 text-xs text-[#6b7480]">点击节点查看连通信息</p>
              </div>
              <Button variant="secondary" type="button" onClick={() => setIsZoomOpen(false)}>
                关闭
              </Button>
            </header>
            <div className="p-4 grid gap-3 min-h-0">{mapStage("zoom")}</div>
          </section>
        </div>
      ) : null}

      {isDetailOpen && selectedNode ? (
        <div className="fixed inset-0 bg-[rgba(15,22,30,0.35)] grid place-items-center p-4 z-50 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="关闭地点详情"
            onClick={() => setIsDetailOpen(false)}
          />
          <section
            className="relative w-[min(560px,92vw)] rounded-[18px] border border-[rgba(217,230,245,0.9)] bg-white/98 shadow-[0_20px_40px_rgba(15,22,30,0.16)] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedNode.name}地点详情`}
          >
            <header className="flex items-center justify-between gap-3 px-4 py-[14px] border-b border-[rgba(217,230,245,0.85)] bg-[rgba(247,251,255,0.9)]">
              <div>
                <h4 className="m-0 text-base font-black text-[#2b2f36]">{selectedNode.name}</h4>
                <p className="mt-1 text-xs text-[#6b7480]">地图接口数据</p>
              </div>
              <button
                className="w-9 h-9 rounded-xl border border-[rgba(217,230,245,0.85)] bg-white text-[#2b2f36] text-xl leading-none transition duration-150 hover:-translate-y-[1px] hover:shadow-[0_12px_22px_rgba(21,33,54,0.12)]"
                type="button"
                onClick={() => setIsDetailOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </header>
            <div className="px-4 pb-[18px] pt-[14px] grid gap-[10px]">
              <p className="m-0 text-sm text-[#2b2f36]">可直达地点与耗时</p>
              <div className="flex flex-wrap gap-2">
                {selectedConnections.length > 0 ? (
                  selectedConnections.map((item) => (
                    <Badge key={item} variant="chip" size="sm">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[#6b7480]">暂无路径信息</span>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </Card>
  );
}
