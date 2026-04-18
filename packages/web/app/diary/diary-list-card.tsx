"use client";

import dayjs from "dayjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import type { DiaryItem, DiaryPagination } from "./diary-data";

interface DiaryListCardProps {
  items?: DiaryItem[];
  pagination?: DiaryPagination;
  isLoading: boolean;
  errorMessage?: string;
  onPageChange: (page: number) => void;
}

const formatGeneratedAt = (value: string) => {
  return dayjs(value).format("YYYY-MM-DD HH:mm");
};

export function DiaryListCard({
  items,
  pagination,
  isLoading,
  errorMessage,
  onPageChange,
}: DiaryListCardProps) {
  const diaries = items ?? [];
  const currentPage = pagination?.page ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const pageItems = buildVisiblePageItems(currentPage, totalPages);

  return (
    <Card>
      <CardHeader className="border-b border-[rgba(217,230,245,0.85)]">
        <CardTitle>日记列表</CardTitle>
        <CardDescription>按日期倒序展示，每页默认 10 篇。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4">
        {isLoading ? (
          <div className="rounded-xl border border-dashed border-[rgba(217,230,245,0.95)] bg-[rgba(247,251,255,0.78)] px-4 py-8 text-center text-sm text-[#6b7480]">
            正在加载日记...
          </div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-[rgba(240,180,180,0.85)] bg-[rgba(255,246,246,0.9)] px-4 py-8 text-center text-sm text-[#8b4a4a]">
            {errorMessage}
          </div>
        ) : diaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(217,230,245,0.95)] bg-[rgba(247,251,255,0.78)] px-4 py-8 text-center text-sm text-[#6b7480]">
            当前筛选条件下还没有日记。
          </div>
        ) : (
          diaries.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[rgba(217,230,245,0.9)] bg-[rgba(247,251,255,0.82)] p-4"
            >
              <div className="flex items-start justify-between gap-3 max-[720px]:flex-col">
                <div className="grid gap-1">
                  <h2 className="m-0 text-[15px] font-black text-[#2b2f36]">{item.displayDate}</h2>
                  <p className="m-0 text-xs text-[#6b7480]">
                    更新时间 {item.displayUpdatedAt} · 生成于 {formatGeneratedAt(item.generatedAt)}
                  </p>
                </div>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.8] text-[#2b2f36]">
                {item.text}
              </div>
            </article>
          ))
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[rgba(217,230,245,0.85)] pt-4 max-[640px]:flex-col max-[640px]:items-stretch">
          <div className="text-sm text-[#6b7480]">
            第 {currentPage} / {totalPages} 页{pagination ? ` · 共 ${pagination.total} 篇` : ""}
          </div>

          <Pagination className="mx-0 w-auto justify-end max-[640px]:justify-center">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={cn(
                    !pagination?.hasPrevPage || isLoading
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!pagination?.hasPrevPage || isLoading) return;
                    onPageChange(currentPage - 1);
                  }}
                />
              </PaginationItem>

              {pageItems.map((item) =>
                item === "ellipsis-left" || item === "ellipsis-right" ? (
                  <PaginationItem key={item}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      href="#"
                      isActive={item === currentPage}
                      onClick={(event) => {
                        event.preventDefault();
                        if (item === currentPage || isLoading) return;
                        onPageChange(item);
                      }}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={cn(
                    !pagination?.hasNextPage || isLoading
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!pagination?.hasNextPage || isLoading) return;
                    onPageChange(currentPage + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </CardContent>
    </Card>
  );
}

function buildVisiblePageItems(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-right", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis-left",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis-left",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-right",
    totalPages,
  ];
}
