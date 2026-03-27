"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { DiaryFilterCard } from "./diary-filter-card";
import { DiaryListCard } from "./diary-list-card";
import { type DiaryResponsePayload } from "./diary-data";
import { DiaryPageHeader } from "./diary-page-header";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

const fetchDiaryPayload = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as DiaryResponsePayload & {
    code?: number;
    message?: string;
  };

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message ?? "日记加载失败");
  }

  return payload;
};

const parseCurrentPage = (value: string | null) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE;
  return parsed;
};

const buildRangeLabel = (startDate?: string, endDate?: string) => {
  if (startDate && endDate) {
    return `${startDate} 至 ${endDate}`;
  }
  if (startDate) {
    return `${startDate} 起`;
  }
  if (endDate) {
    return `截至 ${endDate}`;
  }
  return "全部时间";
};

/**
 * 日记页客户端壳组件。
 *
 * 说明：
 * - 查询条件与页码统一写入 URL，便于刷新、分享和前进后退；
 * - 页面数据完全依赖 nodejs API，避免客户端直接接触数据库模型。
 */
export function DiaryClientShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = parseCurrentPage(searchParams.get("page"));
  const currentStartDate = searchParams.get("startDate") ?? "";
  const currentEndDate = searchParams.get("endDate") ?? "";

  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);

  useEffect(() => {
    setStartDate(currentStartDate);
    setEndDate(currentEndDate);
  }, [currentEndDate, currentStartDate]);

  const apiPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("pageSize", String(DEFAULT_PAGE_SIZE));
    if (currentStartDate) {
      params.set("startDate", currentStartDate);
    }
    if (currentEndDate) {
      params.set("endDate", currentEndDate);
    }
    return `/api/nodejs/diary/index?${params.toString()}`;
  }, [currentEndDate, currentPage, currentStartDate]);

  const { data, error, isLoading } = useSWR(apiPath, fetchDiaryPayload);

  const rangeLabel = useMemo(() => {
    return buildRangeLabel(
      data?.data?.filters?.startDate ?? (currentStartDate || undefined),
      data?.data?.filters?.endDate ?? (currentEndDate || undefined),
    );
  }, [
    currentEndDate,
    currentStartDate,
    data?.data?.filters?.endDate,
    data?.data?.filters?.startDate,
  ]);

  const updateQuery = (next: { page?: number; startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextPage = next.page ?? currentPage;
    const nextStartDate = next.startDate ?? currentStartDate;
    const nextEndDate = next.endDate ?? currentEndDate;

    params.set("page", String(nextPage));

    if (nextStartDate) {
      params.set("startDate", nextStartDate);
    } else {
      params.delete("startDate");
    }

    if (nextEndDate) {
      params.set("endDate", nextEndDate);
    } else {
      params.delete("endDate");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleSubmit = () => {
    updateQuery({
      page: DEFAULT_PAGE,
      startDate,
      endDate,
    });
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    updateQuery({
      page: DEFAULT_PAGE,
      startDate: "",
      endDate: "",
    });
  };

  const handlePageChange = (page: number) => {
    if (page < 1) return;
    updateQuery({
      page,
      startDate: currentStartDate,
      endDate: currentEndDate,
    });
  };

  return (
    <>
      <DiaryPageHeader total={data?.data?.pagination?.total} rangeLabel={rangeLabel} />
      <div className="grid gap-[14px]">
        <DiaryFilterCard
          startDate={startDate}
          endDate={endDate}
          isSubmitting={isLoading}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
        <DiaryListCard
          items={data?.data?.items}
          pagination={data?.data?.pagination}
          isLoading={isLoading}
          errorMessage={error instanceof Error ? error.message : undefined}
          onPageChange={handlePageChange}
        />
      </div>
    </>
  );
}
