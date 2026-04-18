import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type HomeWorldCardProps = {
  time?: string;
  weather?: {
    type?: string;
    temperatureLevel?: string;
    periodStartAt?: string;
    periodEndAt?: string;
    updatedAt?: string;
  };
};

export function HomeWorldCard({ time, weather }: HomeWorldCardProps) {
  const displayTime = time ?? "—";
  const weatherLabel =
    weather?.type && weather?.temperatureLevel
      ? `${weather.type} · ${weather.temperatureLevel}`
      : "—";

  return (
    <Card>
      <div className="p-[14px] grid gap-[14px]">
        <div className="flex items-center justify-between gap-[12px]">
          <h3 className="m-0 text-[14px] font-black tracking-[0.2px]">世界状态</h3>
          <Badge variant="pill" size="default" className="whitespace-nowrap">
            <span className="text-[#6b7480]">世界时间</span>&nbsp;
            <strong className="text-[#2b2f36]">{displayTime}</strong>
          </Badge>
        </div>

        <div className="rounded-xl bg-[rgba(247,251,255,0.8)] border border-[rgba(217,230,245,0.8)] p-[10px]">
          <div className="text-xs text-[#6b7480]">当前天气</div>
          <div className="mt-1.5 text-sm font-extrabold text-[#2b2f36]">{weatherLabel}</div>
        </div>
      </div>
    </Card>
  );
}
