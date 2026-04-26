"use client";

import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "选择日期范围",
  className,
  align = "start",
}: DateRangePickerProps) {
  const label = React.useMemo(() => {
    if (value?.from && value?.to) {
      return `${format(value.from, "yyyy-MM-dd")} 至 ${format(value.to, "yyyy-MM-dd")}`;
    }
    if (value?.from) {
      return `${format(value.from, "yyyy-MM-dd")} 起`;
    }
    return placeholder;
  }, [placeholder, value]);

  const hasValue = Boolean(value?.from);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !hasValue && "text-[#6b7480]",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  );
}
