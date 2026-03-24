"use client";

import { Search, Plus } from "lucide-react";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";
import type { CustomStage } from "@prisma/client";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  platformFilter: string;
  onPlatformChange: (value: string) => void;
  stages: CustomStage[];
  onNewApplication: () => void;
}

export default function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  platformFilter,
  onPlatformChange,
  stages,
  onNewApplication,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          placeholder="Search company, role, location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
      >
        <option value="">All Stages</option>
        {stages.map((s) => (
          <option key={s.id} value={s.slug}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        value={platformFilter}
        onChange={(e) => onPlatformChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
      >
        <option value="">All Platforms</option>
        {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      <button
        onClick={onNewApplication}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus className="w-4 h-4" />
        New
      </button>
    </div>
  );
}
