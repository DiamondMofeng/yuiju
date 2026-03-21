import { notFound } from "next/navigation";
import { isPublicDeployment } from "@/lib/public-deployment";

import { ActivityClientShell } from "./activity-client-shell";
import type { ActivityItem, ActivityResponsePayload } from "./activity-data";
import { ActivityPageHeader } from "./activity-page-header";

export default async function ActivityPage() {
  // 核心逻辑：对外展示版本隐藏动态页。
  if (isPublicDeployment()) {
    notFound();
  }

  let events: ActivityItem[] | undefined;
  let count: number | undefined;

  try {
    const response = await fetch("/api/nodejs/activity/index", { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as ActivityResponsePayload;
      events = payload.data?.events;
      count = payload.data?.count ?? payload.data?.events?.length;
    }
  } catch {
    events = undefined;
    count = undefined;
  }

  return (
    <main className="max-w-[1200px] mx-auto px-[18px] pt-[18px] pb-[36px]">
      <ActivityPageHeader count={count} />
      <ActivityClientShell events={events} />
    </main>
  );
}
