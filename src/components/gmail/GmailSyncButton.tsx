"use client";

import { useState } from "react";
import { Mail, RefreshCw, Download, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function GmailSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleReset = async () => {
    if (!confirm("This will delete all Gmail-synced touchpoints and re-sync from scratch. Continue?")) return;
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/gmail/reset", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResult(`Reset: ${data.touchpointsDeleted} touchpoints cleared. Now click Backfill.`);
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch {
      setResult("Reset failed.");
    }
    setSyncing(false);
  };

  const handleSync = async (isBackfill: boolean) => {
    setSyncing(true);
    setResult(null);
    try {
      const endpoint = isBackfill ? "/api/gmail/backfill" : "/api/gmail/sync";
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        const linkedCount = data._debug?.linkedAccounts?.length ?? data.linkedAccountsFound ?? 0;
        const linked = linkedCount > 0 ? ` (${linkedCount} linked)` : " (0 linked)";
        setResult(
          `${data.emailsProcessed} emails scanned${linked}, ${data.applicationsCreated} new apps, ${data.touchpointsAdded} touchpoints`
        );
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch {
      setResult("Sync failed. Check your connection.");
    }
    setSyncing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleSync(false)}
        disabled={syncing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors disabled:opacity-50"
        title="Sync new emails"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
        Sync
      </button>
      <button
        onClick={() => handleSync(true)}
        disabled={syncing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors disabled:opacity-50"
        title="Scan last 3 months of emails"
      >
        <Download className="w-3.5 h-3.5" />
        Backfill
      </button>
      <button
        onClick={handleReset}
        disabled={syncing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors disabled:opacity-50 text-red-500"
        title="Delete all Gmail touchpoints and re-sync from scratch"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset
      </button>
      {result && (
        <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
          <Mail className="w-3 h-3" />
          {result}
        </span>
      )}
    </div>
  );
}
