"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { ActivityItem, ActivityResponsePayload } from "./activity-data";
import { ActivityCareCard } from "./activity-care-card";
import { ActivityDetailPreviewCard } from "./activity-detail-preview-card";
import { ActivityPageHeader } from "./activity-page-header";
import { ActivityTimelineCard } from "./activity-timeline-card";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

const fetchActivityPayload = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as ActivityResponsePayload & {
    code?: number;
    message?: string;
  };

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message ?? "动态加载失败");
  }

  return payload;
};

const parseCurrentPage = (value: string | null) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE;
  return parsed;
};

/**
 * 动态页客户端壳组件。
 *
 * 说明：
 * - 查询页码统一写入 URL，便于刷新、分享和前进后退；
 * - 页面数据完全依赖 nodejs API，避免客户端直接接触数据库模型。
 */
export function ActivityClientShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPage = parseCurrentPage(searchParams.get("page"));

  const apiPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("pageSize", String(DEFAULT_PAGE_SIZE));
    return `/api/nodejs/activity/activity?${params.toString()}`;
  }, [currentPage]);

  const { data, error, isLoading, isValidating } = useSWR(apiPath, fetchActivityPayload, {
    keepPreviousData: true,
  });
  const events = data?.data?.events;
  const pagination = data?.data?.pagination;
  const isBusy = isLoading || isValidating;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(events?.[0]?.id ?? null);
  }, [events]);

  const selectedEvent = useMemo(
    () => events?.find((item) => item.id === selectedId) ?? events?.[0],
    [events, selectedId],
  );

  const handlePageChange = (page: number) => {
    if (page < 1 || page === currentPage) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <>
      <ActivityPageHeader count={pagination?.total} />
      <div className="grid grid-cols-[1fr_360px] max-[1020px]:grid-cols-1 gap-[14px] items-start">
        <ActivityTimelineCard
          events={events}
          isLoading={isBusy}
          errorMessage={error instanceof Error ? error.message : undefined}
          pagination={pagination}
          selectedId={selectedEvent?.id ?? null}
          onSelect={setSelectedId}
          onPageChange={handlePageChange}
        />
        <div className="grid gap-[14px]">
          <ActivityCareCard />
          <ActivityDetailPreviewCard event={selectedEvent} />
        </div>
      </div>
    </>
  );
}
