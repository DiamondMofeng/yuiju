"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-3",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center text-[13px] font-semibold",
        caption_label: "text-[13px] font-semibold",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute left-1 top-1 inline-flex items-center justify-center h-7 w-7 rounded-md border border-[rgba(217,230,245,0.9)] bg-white text-[#2b2f36] hover:bg-[rgba(247,251,255,0.9)]",
        ),
        button_next: cn(
          "absolute right-1 top-1 inline-flex items-center justify-center h-7 w-7 rounded-md border border-[rgba(217,230,245,0.9)] bg-white text-[#2b2f36] hover:bg-[rgba(247,251,255,0.9)]",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-[#6b7480] rounded-md w-9 font-normal text-[12px] flex items-center justify-center",
        week: "flex w-full mt-1",
        day: cn(
          "relative p-0 text-center text-[13px] focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-[rgba(145,196,238,0.18)]",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(
          "inline-flex items-center justify-center h-9 w-9 rounded-md font-normal hover:bg-[rgba(247,251,255,0.9)] aria-selected:opacity-100",
        ),
        range_start:
          "day-range-start [&>button]:bg-[rgba(145,196,238,0.85)] [&>button]:text-[#2b2f36] [&>button]:hover:bg-[rgba(145,196,238,0.95)]",
        range_end:
          "day-range-end [&>button]:bg-[rgba(145,196,238,0.85)] [&>button]:text-[#2b2f36] [&>button]:hover:bg-[rgba(145,196,238,0.95)]",
        selected:
          "[&>button]:bg-[rgba(145,196,238,0.85)] [&>button]:text-[#2b2f36] [&>button]:hover:bg-[rgba(145,196,238,0.95)] [&>button]:focus:bg-[rgba(145,196,238,0.95)]",
        today: "[&>button]:font-semibold [&>button]:text-[#2b2f36]",
        outside: "text-[#6b7480]/60 aria-selected:text-[#6b7480]",
        disabled: "text-[#6b7480]/40 opacity-50",
        range_middle:
          "aria-selected:bg-[rgba(145,196,238,0.18)] aria-selected:text-[#2b2f36] [&>button]:bg-transparent",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: (chevronProps) => {
          if (chevronProps.orientation === "left") {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
