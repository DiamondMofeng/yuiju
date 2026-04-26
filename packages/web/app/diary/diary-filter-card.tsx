"use client";

import { useMemo } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";

interface DiaryFilterCardProps {
  startDate: string;
  endDate: string;
  isSubmitting: boolean;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

const parseDate = (value: string): Date | undefined => {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export function DiaryFilterCard({
  startDate,
  endDate,
  isSubmitting,
  onStartDateChange,
  onEndDateChange,
  onSubmit,
  onReset,
}: DiaryFilterCardProps) {
  const range = useMemo<DateRange | undefined>(() => {
    const from = parseDate(startDate);
    const to = parseDate(endDate);
    if (!from && !to) return undefined;
    return { from, to };
  }, [startDate, endDate]);

  const handleRangeChange = (next: DateRange | undefined) => {
    onStartDateChange(next?.from ? formatDate(next.from) : "");
    onEndDateChange(next?.to ? formatDate(next.to) : "");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>日期范围</CardTitle>
        <CardDescription>留空时查询全部时间，结束日期会包含当天的日记。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <DateRangePicker value={range} onChange={handleRangeChange} />

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onReset} disabled={isSubmitting}>
            重置
          </Button>
          <Button variant="secondary" type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "查询中..." : "查询"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
