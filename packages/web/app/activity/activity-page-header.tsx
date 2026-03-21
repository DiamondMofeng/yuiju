import { Badge } from "@/components/ui/badge";

interface ActivityPageHeaderProps {
  count?: number;
}

export function ActivityPageHeader({ count }: ActivityPageHeaderProps) {
  const displayCount = typeof count === "number" ? `${count} 条` : "—";
  return (
    <div className="flex items-end justify-between gap-4 mt-4.5 mb-3.5 max-[1020px]:flex-col max-[1020px]:items-start">
      <div>
        <h1 className="m-0 text-[18px] font-extrabold">动态</h1>
        <p className="mt-1.5 text-[13px] text-[#6b7480]">行为时间线 + 轻管理（零花钱）</p>
      </div>

      <Badge variant="pill" size="default" className="whitespace-nowrap">
        <span className="text-[#6b7480]">今日记录</span>&nbsp;
        <strong>{displayCount}</strong>
      </Badge>
    </div>
  );
}
