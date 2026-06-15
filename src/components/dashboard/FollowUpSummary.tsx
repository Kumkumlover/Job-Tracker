"use client";

import { differenceInDays, isToday } from "date-fns";
import { AlertCircle } from "lucide-react";
import type { ApplicationWithRelations } from "@/types";

export default function FollowUpSummary({
  applications,
}: {
  applications: ApplicationWithRelations[];
}) {
  const today = new Date();
  let overdue = 0;
  let dueToday = 0;

  for (const app of applications) {
    if (!app.followUpDate) continue;
    const fu = new Date(app.followUpDate);
    if (isToday(fu)) dueToday++;
    else if (differenceInDays(fu, today) < 0) overdue++;
  }

  if (overdue === 0 && dueToday === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-900/20 border border-amber-800 text-sm">
      <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <span>
        {overdue > 0 && (
          <span className="text-red-400 font-medium">
            {overdue} overdue follow-up{overdue > 1 ? "s" : ""}
          </span>
        )}
        {overdue > 0 && dueToday > 0 && " and "}
        {dueToday > 0 && (
          <span className="text-amber-400 font-medium">
            {dueToday} follow-up{dueToday > 1 ? "s" : ""} due today
          </span>
        )}
      </span>
    </div>
  );
}
