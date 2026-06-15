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
      "bg-amber-900/30 text-amber-300 animate-pulse";
    label = "Follow up today!";
  } else if (diff < 0) {
    className =
      "bg-red-900/30 text-red-300";
    label = `Overdue by ${Math.abs(diff)}d`;
  } else if (isTomorrow(followUp)) {
    className =
      "bg-orange-900/30 text-orange-300";
    label = "Tomorrow";
  } else if (diff <= 7) {
    className =
      "bg-[var(--primary)]/10 text-[var(--primary)]";
    label = `In ${diff}d`;
  } else {
    className =
      "bg-[var(--secondary)] text-[var(--muted-foreground)]";
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
