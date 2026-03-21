"use client";

import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "./activity-data";

interface ActivityTimelineCardProps {
  events?: ActivityItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

type TimeRangeOption = "today" | "last7" | "all";
type TriggerFilter = "all" | ActivityItem["trigger"];
type EpisodeTypeFilter = "all" | ActivityItem["episodeType"];

/**
 * 动态时间线卡片。
 *
 * 说明：
 * - 所有筛选都基于 Episode 派生数据进行，不再假设只有行为事件；
 * - 通过 selectedId / onSelect 与右侧详情卡片联动，避免组件内部维护重复状态。
 */
export function ActivityTimelineCard({ events, selectedId, onSelect }: ActivityTimelineCardProps) {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("today");
  const [trigger, setTrigger] = useState<TriggerFilter>("all");
  const [episodeType, setEpisodeType] = useState<EpisodeTypeFilter>("all");
  const [keyword, setKeyword] = useState("");

  const displayEvents = useMemo(() => (events && events.length > 0 ? events : []), [events]);

  const filteredEvents = useMemo(() => {
    let next = displayEvents;
    const now = dayjs();

    if (timeRange === "today") {
      next = next.filter((item) => dayjs(item.happenedAt).isSame(now, "day"));
    } else if (timeRange === "last7") {
      const from = now.subtract(6, "day").startOf("day");
      next = next.filter(
        (item) => dayjs(item.happenedAt).isAfter(from) || dayjs(item.happenedAt).isSame(from),
      );
    }

    if (trigger !== "all") {
      next = next.filter((item) => item.trigger === trigger);
    }

    if (episodeType !== "all") {
      next = next.filter((item) => item.episodeType === episodeType);
    }

    const normalizedKeyword = keyword.trim().toLowerCase();
    if (normalizedKeyword) {
      next = next.filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(normalizedKeyword);
        const summaryMatch = item.summary.toLowerCase().includes(normalizedKeyword);
        const detailMatch = item.detailFields.some((field) =>
          `${field.label} ${field.value}`.toLowerCase().includes(normalizedKeyword),
        );
        return titleMatch || summaryMatch || detailMatch;
      });
    }

    return next;
  }, [displayEvents, episodeType, keyword, timeRange, trigger]);

  return (
    <Card>
      <div className="p-3.5 grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-[14px] font-black">动态时间线</h3>
          <Badge
            variant="soft"
            size="sm"
            className="border-[rgba(175,122,197,0.25)] bg-[rgba(175,122,197,0.12)] text-[#2b2f36]"
          >
            MemoryEpisode 派生
          </Badge>
        </div>

        <div className="grid grid-cols-4 gap-2.5 max-[760px]:grid-cols-2 max-[520px]:grid-cols-1">
          <div className="grid gap-1.5">
            <label className="text-[12px] text-[#6b7480]" htmlFor="timeRange">
              时间范围
            </label>
            <Select
              value={timeRange}
              onValueChange={(value: string) => setTimeRange(value as TimeRangeOption)}
            >
              <SelectTrigger id="timeRange" aria-label="选择时间范围">
                <SelectValue placeholder="选择时间范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">今天</SelectItem>
                <SelectItem value="last7">近 7 天</SelectItem>
                <SelectItem value="all">全部</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-[6px]">
            <label className="text-[12px] text-[#6b7480]" htmlFor="trigger">
              触发来源
            </label>
            <Select
              value={trigger}
              onValueChange={(value: string) => setTrigger(value as TriggerFilter)}
            >
              <SelectTrigger id="trigger" aria-label="选择触发来源">
                <SelectValue placeholder="选择触发来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="agent">agent</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="system">system</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-[6px]">
            <label className="text-[12px] text-[#6b7480]" htmlFor="episodeType">
              事件类型
            </label>
            <Select
              value={episodeType}
              onValueChange={(value: string) => setEpisodeType(value as EpisodeTypeFilter)}
            >
              <SelectTrigger id="episodeType" aria-label="选择事件类型">
                <SelectValue placeholder="选择事件类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="behavior">behavior</SelectItem>
                <SelectItem value="conversation">conversation</SelectItem>
                <SelectItem value="plan_created">plan_created</SelectItem>
                <SelectItem value="plan_updated">plan_updated</SelectItem>
                <SelectItem value="plan_completed">plan_completed</SelectItem>
                <SelectItem value="plan_abandoned">plan_abandoned</SelectItem>
                <SelectItem value="plan_superseded">plan_superseded</SelectItem>
                <SelectItem value="system">system</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-[6px]">
            <label className="text-[12px] text-[#6b7480]" htmlFor="keyword">
              关键词搜索
            </label>
            <Input
              id="keyword"
              placeholder="输入标题、摘要或详情字段"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
        </div>

        <div className="relative pl-[18px] grid gap-3 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[rgba(145,196,238,0.6)] before:rounded-full">
          {filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-[rgba(217,230,245,0.9)] bg-[rgba(255,255,255,0.84)] shadow-[0_10px_25px_rgba(21,33,54,0.06)] p-3 text-[13px] text-[#6b7480]">
              没有匹配的记录，试试调整筛选条件。
            </div>
          ) : (
            filteredEvents.map((item) => {
              const tone =
                item.trigger === "agent"
                  ? "bg-[rgba(145,196,238,0.18)] border-[rgba(145,196,238,0.3)] text-[#2b2f36]"
                  : item.trigger === "user"
                    ? "bg-[rgba(250,227,190,0.75)] border-[rgba(250,227,190,0.85)] text-[#2b2f36]"
                    : "bg-[rgba(175,122,197,0.14)] border-[rgba(175,122,197,0.25)] text-[#2b2f36]";
              const isSelected = selectedId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect?.(item.id)}
                  className={cn(
                    "relative text-left rounded-2xl border bg-[rgba(255,255,255,0.84)] shadow-[0_10px_25px_rgba(21,33,54,0.06)] p-3 grid gap-2 before:content-[''] before:absolute before:-left-3.5 before:top-[18px] before:w-2.5 before:h-2.5 before:rounded-full before:bg-[rgba(145,196,238,0.9)] before:border-2 before:border-[rgba(247,251,255,1)] transition-colors",
                    isSelected
                      ? "border-[rgba(145,196,238,0.95)] ring-2 ring-[rgba(145,196,238,0.25)]"
                      : "border-[rgba(217,230,245,0.9)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 flex-wrap">
                      <h3 className="m-0 text-[14px] font-black">{item.title}</h3>
                      <Badge variant="soft" size="sm" className={cn("px-[10px] py-[7px]", tone)}>
                        {item.trigger}
                      </Badge>
                      <Badge
                        variant="soft"
                        size="sm"
                        className="border-[rgba(217,230,245,0.9)] bg-[rgba(247,251,255,0.9)] text-[#6b7480]"
                      >
                        {item.episodeType}
                      </Badge>
                    </div>
                    <span className="text-[12px] text-[#6b7480]">
                      {item.timeLabel} · {item.durationMinutes}min
                    </span>
                  </div>

                  <p className="m-0 text-[13px] text-[#6b7480]">{item.summary}</p>

                  <div className="flex items-center justify-between gap-3 text-[12px] text-[#6b7480]">
                    <span>{item.dateLabel}</span>
                    <span>
                      重要度 {item.importance.toFixed(2)} · {item.extractionStatus}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}
