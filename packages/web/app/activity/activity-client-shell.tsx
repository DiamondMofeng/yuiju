"use client";

import { useMemo, useState } from "react";
import type { ActivityItem } from "./activity-data";
import { ActivityCareCard } from "./activity-care-card";
import { ActivityDetailPreviewCard } from "./activity-detail-preview-card";
import { ActivityTimelineCard } from "./activity-timeline-card";

interface ActivityClientShellProps {
  events?: ActivityItem[];
}

/**
 * 动态页客户端壳组件。
 *
 * 说明：
 * - 统一承接时间线筛选、选中状态与详情预览联动；
 * - 页面本身只负责数据获取，交互状态收敛到单一客户端组件中管理。
 */
export function ActivityClientShell({ events }: ActivityClientShellProps) {
  const [selectedId, setSelectedId] = useState<string | null>(events?.[0]?.id ?? null);

  const selectedEvent = useMemo(
    () => events?.find((item) => item.id === selectedId) ?? events?.[0],
    [events, selectedId],
  );

  return (
    <div className="grid grid-cols-[1fr_360px] max-[1020px]:grid-cols-1 gap-[14px] items-start">
      <ActivityTimelineCard
        events={events}
        selectedId={selectedEvent?.id ?? null}
        onSelect={setSelectedId}
      />
      <div className="grid gap-[14px]">
        <ActivityCareCard />
        <ActivityDetailPreviewCard event={selectedEvent} />
      </div>
    </div>
  );
}
