"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HomeMapCardProps = {
  location?: string;
};

type MapNode = {
  name: string;
  left: string;
  top: string;
  tag: string;
  desc: string;
  detail: string;
  actions: string[];
};

const mapNodes: MapNode[] = [];

export function HomeMapCard({ location }: HomeMapCardProps) {
  const currentLocation = location ?? "";
  const [selectedName, setSelectedName] = useState(currentLocation);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const hasMapNodes = mapNodes.length > 0;

  useEffect(() => {
    if (!hasMapNodes) return;
    if (!mapNodes.some((node) => node.name === selectedName)) {
      setSelectedName(currentLocation);
    }
  }, [currentLocation, hasMapNodes, selectedName]);

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
    return (
      mapNodes.find((node) => node.name === selectedName) ??
      mapNodes.find((node) => node.name === currentLocation) ??
      mapNodes[0]
    );
  }, [currentLocation, hasMapNodes, selectedName]);

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
          preserveAspectRatio="none"
        >
          <title>地图连线</title>
          <line
            x1="22"
            y1="62"
            x2="55"
            y2="48"
            stroke="rgba(145,196,238,0.9)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <line
            x1="55"
            y1="48"
            x2="78"
            y2="68"
            stroke="rgba(145,196,238,0.9)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <line
            x1="22"
            y1="62"
            x2="78"
            y2="68"
            stroke="rgba(145,196,238,0.9)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </svg>

        {mapNodes.map((node) => {
          const isActive = node.name === currentLocation;
          const isSelected = node.name === selectedNode?.name;
          return (
            <div
              key={node.name}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 w-max min-w-[126px] max-w-[calc(100%-12px)] z-[2] max-[520px]:min-w-[108px]",
                isActive && "z-5",
              )}
              style={{ left: node.left, top: node.top }}
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
                  setSelectedName(node.name);
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
                  {isActive ? "当前" : node.tag}
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
                <p className="mt-1 text-xs text-[#6b7480]">点击节点查看详情</p>
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
                <p className="mt-1 text-xs text-[#6b7480]">RPG 地图 · 地点详情</p>
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
              <p className="m-0 text-sm text-[#2b2f36]">{selectedNode.detail}</p>
              <p className="m-0 text-xs text-[#6b7480]">{selectedNode.desc}</p>
              <div className="flex flex-wrap gap-2">
                {selectedNode.actions.map((action) => (
                  <Badge key={action} variant="chip" size="sm">
                    {action}
                  </Badge>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </Card>
  );
}
