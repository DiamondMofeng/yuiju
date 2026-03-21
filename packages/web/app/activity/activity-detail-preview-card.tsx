import { Card } from "@/components/ui/card";
import type { ActivityItem } from "./activity-data";

type ActivityDetailPreviewCardProps = {
  event?: ActivityItem;
};

/**
 * 动态详情预览卡片。
 *
 * 说明：
 * - 展示的是 MemoryEpisode 派生后的明细字段，而不是旧行为记录占位文案；
 * - 同时保留 payloadPreview，便于调试复杂事件结构。
 */
export function ActivityDetailPreviewCard({ event }: ActivityDetailPreviewCardProps) {
  if (!event) {
    return (
      <Card>
        <div className="p-[14px] grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-[14px] font-black">详情预览</h3>
          </div>

          <div className="m-3 p-3 rounded-xl border border-dashed border-[rgba(217,230,245,0.85)] bg-[rgba(247,251,255,0.6)] text-[12px] text-[#6b7480]">
            暂无可预览的详情。
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-[14px] grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-[14px] font-black">详情预览</h3>
          <span className="text-[12px] text-[#6b7480]">{event.episodeType}</span>
        </div>

        <div className="grid gap-2">
          {event.detailFields.map((field) => (
            <div
              key={`${event.id}-${field.label}`}
              className="grid grid-cols-[84px_1fr] gap-3 rounded-xl border border-[rgba(217,230,245,0.85)] bg-[rgba(247,251,255,0.78)] px-3 py-2"
            >
              <span className="text-[12px] text-[#6b7480]">{field.label}</span>
              <span className="text-[12px] text-[rgba(43,47,54,0.92)] whitespace-pre-wrap break-all">
                {field.value}
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <span className="text-[12px] text-[#6b7480]">原始 payload 预览</span>
          <pre className="m-0 p-3 rounded-xl border border-[rgba(217,230,245,0.85)] bg-[rgba(247,251,255,0.85)] overflow-auto text-[12px] text-[rgba(43,47,54,0.85)]">
            {event.payloadPreview}
          </pre>
        </div>
      </div>
    </Card>
  );
}
