"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "~/utils/cn"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-between pt-1 relative items-center px-8",
        caption_label: "text-sm font-semibold text-slate-900 dark:text-slate-100",
        nav: "flex items-center",
        button_previous: cn(
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-all rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
          "absolute left-1"
        ),
        button_next: cn(
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-all rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
          "absolute right-1"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex w-full justify-between mt-2",
        weekday: "text-slate-400 dark:text-slate-500 rounded-md w-9 font-medium text-[0.8rem] text-center",
        week: "flex w-full mt-2 justify-between",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-slate-100 dark:[&:has([aria-selected])]:bg-slate-850 rounded-lg"
        ),
        day_button: cn(
          "h-9 w-9 p-0 font-normal hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg text-slate-900 dark:text-slate-100 flex items-center justify-center transition-all cursor-pointer"
        ),
        selected:
          "bg-indigo-600 text-white hover:bg-indigo-500 focus:bg-indigo-600 focus:text-white rounded-lg",
        today: "border border-indigo-500/50 text-indigo-600 dark:text-indigo-400 font-bold",
        outside: "text-slate-400 dark:text-slate-600 opacity-40",
        disabled: "text-slate-300 dark:text-slate-750 opacity-30 cursor-not-allowed",
        range_middle:
          "aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800 aria-selected:text-slate-900 dark:aria-selected:text-slate-100",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
