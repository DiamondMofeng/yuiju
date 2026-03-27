import { Badge } from "@/components/ui/badge";

interface DiaryPageHeaderProps {
  total?: number;
  rangeLabel?: string;
}

export function DiaryPageHeader({ total, rangeLabel }: DiaryPageHeaderProps) {
  const displayTotal = typeof total === "number" ? `${total} 篇` : "—";
  const displayRange = rangeLabel ?? "全部时间";

  return (
    <div className="flex items-end justify-between gap-4 mt-4.5 mb-3.5 max-[1020px]:flex-col max-[1020px]:items-start">
      <div>
        <h1 className="m-0 text-[18px] font-extrabold">日记</h1>
        <p className="mt-1.5 text-[13px] text-[#6b7480]">按日期范围回看悠酱写下的每日记录</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="pill" size="default" className="whitespace-nowrap">
          <span className="text-[#6b7480]">时间范围</span>&nbsp;
          <strong>{displayRange}</strong>
        </Badge>
        <Badge variant="pill" size="default" className="whitespace-nowrap">
          <span className="text-[#6b7480]">共</span>&nbsp;
          <strong>{displayTotal}</strong>
        </Badge>
      </div>
    </div>
  );
}
