"use client";

import { useState, useRef, useEffect } from "react";
import { Mail, RefreshCw, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function GmailSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSync = async (mode: "incremental" | "full") => {
    setMenuOpen(false);
    setSyncing(true);
    setResult(null);
    try {
      const url = mode === "full" ? "/api/gmail/sync?mode=full" : "/api/gmail/sync";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        const linkedCount = data.linkedAccountsFound ?? 0;
        const linked = linkedCount > 0 ? ` (${linkedCount} linked)` : "";
        const scanMode = data.mode === "full" ? " [full scan]" : "";
        setResult(
          `${data.emailsProcessed} emails scanned${linked}${scanMode}, ${data.applicationsCreated} new apps, ${data.touchpointsAdded} touchpoints`
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
      <div className="relative" ref={menuRef}>
        <div className="flex">
          <button
            onClick={() => handleSync("incremental")}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors disabled:opacity-50"
            title="Sync emails (auto-detects full scan on first run)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={syncing}
            className="flex items-center px-1.5 py-1.5 rounded-r-lg border border-l-0 border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors disabled:opacity-50"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        {menuOpen && (
          <div className="absolute top-full right-0 mt-1 w-56 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg z-50">
            <button
              onClick={() => handleSync("full")}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--secondary)] rounded-lg transition-colors"
            >
              <div className="font-medium">Full Scan</div>
              <div className="text-xs text-[var(--muted-foreground)]">Re-scan last 3 months of emails</div>
            </button>
          </div>
        )}
      </div>
      {result && (
        <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
          <Mail className="w-3 h-3" />
          {result}
        </span>
      )}
    </div>
  );
}
