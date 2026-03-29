import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeForDedup(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(
      /\b(pvt|private|ltd|limited|inc|incorporated|corp|corporation|llp|llc)\b\.?/gi,
      ""
    )
    .trim();
}
