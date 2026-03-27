"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DiaryFilterCardProps {
  startDate: string;
  endDate: string;
  isSubmitting: boolean;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

export function DiaryFilterCard({
  startDate,
  endDate,
  isSubmitting,
  onStartDateChange,
  onEndDateChange,
  onSubmit,
  onReset,
}: DiaryFilterCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>日期范围</CardTitle>
        <CardDescription>留空时查询全部时间，结束日期会包含当天的日记。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
          <label htmlFor="diary-start-date" className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#6b7480]">开始日期</span>
            <Input
              id="diary-start-date"
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
            />
          </label>
          <label htmlFor="diary-end-date" className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#6b7480]">结束日期</span>
            <Input
              id="diary-end-date"
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </label>
        </div>

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
