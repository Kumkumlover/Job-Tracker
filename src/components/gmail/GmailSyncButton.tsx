"use client";

import { useState } from "react";
import { Mail, RefreshCw, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function GmailSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleSync = async (isBackfill: boolean) => {
    setSyncing(true);
    setResult(null);
    try {
      const endpoint = isBackfill ? "/api/gmail/backfill" : "/api/gmail/sync";
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        const linked = data.linkedAccountsFound ? ` (${data.linkedAccountsFound} linked)` : "";
        setResult(
          `${data.emailsProcessed} emails scanned${linked}, ${data.applicationsCreated} new apps, ${data.touchpointsAdded} touchpoints added`
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
      {result && (
        <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
          <Mail className="w-3 h-3" />
          {result}
        </span>
      )}
    </div>
  );
}
