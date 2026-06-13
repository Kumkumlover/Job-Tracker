"use client";

import { differenceInDays, isToday, isTomorrow, format } from "date-fns";

export default function FollowUpBadge({ date }: { date: string | null }) {
  if (!date) return null;

  const followUp = new Date(date);
  const today = new Date();
  const diff = differenceInDays(followUp, today);

  let className = "";
  let label = "";

  if (isToday(followUp)) {
    className =
      "bg-indigo-500/10 text-indigo-400  dark:bg-amber-900/30 dark:text-amber-300 animate-pulse";
    label = "Follow up today!";
  } else if (diff < 0) {
    className =
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    label = `Overdue by ${Math.abs(diff)}d`;
  } else if (isTomorrow(followUp)) {
    className =
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    label = "Tomorrow";
  } else if (diff <= 7) {
    className =
      "bg-indigo-500/10 text-indigo-400  dark:bg-blue-900/30 dark:text-blue-300";
    label = `In ${diff}d`;
  } else {
    className =
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    label = format(followUp, "MMM d");
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
