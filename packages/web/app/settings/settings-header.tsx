import { Badge } from "@/components/ui/badge";

export function SettingsHeader() {
  return (
    <div className="flex items-end justify-between gap-4 mt-[18px] mb-[14px] max-[1020px]:flex-col max-[1020px]:items-start">
      <div>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[0.2px]">设置</h1>
        <p className="mt-1.5 text-[13px] text-[#6b7480]">对话标识保存在本地浏览器</p>
      </div>

      <Badge
        variant="pill"
        size="default"
        className="whitespace-nowrap border-[#d9e6f5] bg-[#f7fbff] text-[#2b2f36]"
      >
        <span className="text-[#6b7480]">主题</span>
        <strong>—</strong>
      </Badge>
    </div>
  );
}
