"use client";

import { LayoutGrid, Table } from "lucide-react";

interface ViewToggleProps {
  view: "table" | "kanban";
  onViewChange: (view: "table" | "kanban") => void;
}

export default function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => onViewChange("table")}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
          view === "table"
            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "hover:bg-[var(--secondary)]"
        }`}
      >
        <Table className="w-4 h-4" />
        Table
      </button>
      <button
        onClick={() => onViewChange("kanban")}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
          view === "kanban"
            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "hover:bg-[var(--secondary)]"
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        Board
      </button>
    </div>
  );
}
