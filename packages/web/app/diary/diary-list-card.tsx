"use client";

import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!pagination?.hasPrevPage || isLoading}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!pagination?.hasNextPage || isLoading}
            >
              下一页
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
