"use client";

import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import {
  ArrowUpDown,
  ExternalLink,
  Trash2,
  MessageSquare,
  Mail,
  Send,
  Inbox,
  ChevronDown,
} from "lucide-react";
import FollowUpBadge from "./FollowUpBadge";
import { PLATFORM_LABELS, TOUCHPOINT_LABELS, type Platform } from "@/lib/constants";
import type { ApplicationWithRelations } from "@/types";
import type { CustomProperty, CustomStage } from "@prisma/client";
import type { Touchpoint } from "@prisma/client";

function TouchpointDropdown({ touchpoints }: { touchpoints: Touchpoint[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const emailTps = touchpoints.filter(tp => tp.emailMessageId);
  if (emailTps.length === 0 && touchpoints.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1 text-green-500 hover:text-green-400 transition-colors"
        title="View touchpoints"
      >
        <span className="text-xs text-[var(--muted-foreground)]">{touchpoints.length}</span>
        <Mail className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--secondary)]">
            <span className="text-xs font-medium">{touchpoints.length} touchpoint{touchpoints.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {touchpoints.map((tp) => {
              const meta = tp.metadata as Record<string, string> | null;
              const subject = meta?.subject;
              const isOutbound = tp.type === "email_to_hr";
              const Icon = isOutbound ? Send : Inbox;
              return (
                <div key={tp.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--secondary)] border-b border-[var(--border)] last:border-0">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isOutbound ? "text-blue-400" : "text-green-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {TOUCHPOINT_LABELS[tp.type] || tp.type}
                    </div>
                    {subject && (
                      <div className="text-[11px] text-[var(--muted-foreground)] truncate">{subject}</div>
                    )}
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {format(new Date(tp.date), "MMM d, yyyy")}
                    </div>
                  </div>
                  {tp.emailMessageId && (
                    <a
                      href={`/api/gmail/open?tp=${tp.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-400 shrink-0"
                      title="Open in Gmail"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface TableViewProps {
  applications: ApplicationWithRelations[];
  stages: CustomStage[];
  customProperties: CustomProperty[];
  onEdit: (app: ApplicationWithRelations) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
}

function SortHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: string;
  onSort: (col: string) => void;
}) {
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] select-none"
      onClick={() => onSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortBy === column && (
          <ArrowUpDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );
}

export default function TableView({
  applications,
  stages,
  customProperties,
  onEdit,
  onDelete,
  onStatusChange,
  sortBy,
  sortOrder,
  onSort,
}: TableViewProps) {
  const getStageColor = (slug: string) =>
    stages.find((s) => s.slug === slug)?.color || "#6b7280";

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--secondary)]">
          <tr>
            <SortHeader label="Company" column="company" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <SortHeader label="Role" column="role" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Platform
            </th>
            <SortHeader label="Applied" column="dateApplied" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <SortHeader label="Follow Up" column="followUpDate" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Location
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Touchpoints
            </th>
            {customProperties.map((cp) => (
              <th
                key={cp.id}
                className="px-4 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
              >
                {cp.name}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {applications.length === 0 && (
            <tr>
              <td
                colSpan={8 + customProperties.length}
                className="px-4 py-12 text-center text-[var(--muted-foreground)]"
              >
                No applications yet. Click &quot;New&quot; to add one!
              </td>
            </tr>
          )}
          {applications.map((app) => (
            <tr
              key={app.id}
              className="hover:bg-[var(--secondary)] cursor-pointer transition-colors"
              onClick={() => onEdit(app)}
            >
              <td className="px-4 py-3 font-medium">
                <div className="flex items-center gap-2">
                  {app.company}
                  {app.jobUrl && (
                    <a
                      href={app.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">{app.role}</td>
              <td className="px-4 py-3">
                <select
                  value={app.status}
                  onChange={(e) => {
                    e.stopPropagation();
                    onStatusChange(app.id, e.target.value);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="px-2 py-1 rounded text-xs font-medium border-0 bg-transparent cursor-pointer"
                  style={{
                    color: getStageColor(app.status),
                  }}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {PLATFORM_LABELS[app.platform as Platform] || app.platform}
              </td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {format(new Date(app.dateApplied), "MMM d, yyyy")}
              </td>
              <td className="px-4 py-3">
                <FollowUpBadge date={app.followUpDate?.toString() || null} />
              </td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {app.location || "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {app.linkedinDmSent && (
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  {app.touchpoints.length > 0 && (
                    <TouchpointDropdown touchpoints={app.touchpoints} />
                  )}
                </div>
              </td>
              {customProperties.map((cp) => {
                const cv = app.customValues.find(
                  (v) => v.customPropertyId === cp.id
                );
                return (
                  <td
                    key={cp.id}
                    className="px-4 py-3 text-[var(--muted-foreground)]"
                  >
                    {cv?.value || "—"}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this application?")) onDelete(app.id);
                  }}
                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted-foreground)] hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
