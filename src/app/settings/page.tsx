"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, GripVertical, Key, Copy, Mail, CheckCircle, AlertCircle } from "lucide-react";
import {
  useCustomProperties,
  useCreateCustomProperty,
  useDeleteCustomProperty,
  useCustomStages,
  useCreateCustomStage,
  useUpdateCustomStage,
  useDeleteCustomStage,
} from "@/hooks/useCustomProperties";
import { PROPERTY_TYPES } from "@/lib/constants";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const { data: properties = [] } = useCustomProperties();
  const { data: stages = [] } = useCustomStages();
  const createProperty = useCreateCustomProperty();
  const deleteProperty = useDeleteCustomProperty();
  const createStage = useCreateCustomStage();
  const updateStage = useUpdateCustomStage();
  const deleteStage = useDeleteCustomStage();

  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState("text");
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#6b7280");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<{ id: string; email: string; lastSyncedAt: string | null }[]>([]);
  const [gmailMessage, setGmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/extension/token")
      .then((r) => r.json())
      .then((d) => setApiKey(d.apiKey || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/gmail/linked-accounts")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setLinkedAccounts(d))
      .catch(() => {});
  }, [status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "gmail_linked") {
      setGmailMessage({ type: "success", text: "Gmail account connected successfully!" });
      fetch("/api/gmail/linked-accounts")
        .then((r) => r.json())
        .then((d) => Array.isArray(d) && setLinkedAccounts(d))
        .catch(() => {});
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("error") === "gmail_link_failed") {
      const detail = params.get("detail") || "";
      setGmailMessage({ type: "error", text: `Failed to connect Gmail: ${detail || "Unknown error"}` });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const handleUnlinkGmail = async (id: string) => {
    if (!confirm("Disconnect this Gmail account?")) return;
    await fetch("/api/gmail/linked-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLinkedAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAddProperty = () => {
    if (!newPropName.trim()) return;
    createProperty.mutate(
      { name: newPropName.trim(), type: newPropType },
      { onSuccess: () => { setNewPropName(""); setNewPropType("text"); } }
    );
  };

  const handleAddStage = () => {
    if (!newStageName.trim()) return;
    createStage.mutate(
      { name: newStageName.trim(), color: newStageColor },
      { onSuccess: () => { setNewStageName(""); setNewStageColor("#6b7280"); } }
    );
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {/* Gmail Accounts */}
        <section className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5" />
            Gmail Accounts
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Connect additional Gmail accounts to sync job emails. Your primary login account is always synced.
          </p>

          {gmailMessage && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-3 ${gmailMessage.type === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
              {gmailMessage.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {gmailMessage.text}
            </div>
          )}

          {/* Primary account */}
          <div className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)] mb-2">
            <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
            <span className="flex-1 text-sm">{(session?.user as { email?: string })?.email || "Primary account"}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Primary</span>
          </div>

          {/* Linked accounts */}
          {linkedAccounts.map((account) => (
            <div key={account.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)] mb-2">
              <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
              <span className="flex-1 text-sm">{account.email}</span>
              {account.lastSyncedAt && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  synced {new Date(account.lastSyncedAt).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => handleUnlinkGmail(account.id)}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted-foreground)] hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <a
            href="/api/gmail/link"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors mt-1"
          >
            <Plus className="w-4 h-4" />
            Connect another Gmail
          </a>
        </section>

        {/* Extension API Key */}
        <section className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Key className="w-5 h-5" />
            Extension API Key
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            Use this key in the browser extension to connect it to your account.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--secondary)] text-sm font-mono break-all">
              {apiKey || "Loading..."}
            </code>
            <button
              onClick={copyApiKey}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>

        {/* Custom Stages */}
        <section className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-lg font-semibold mb-3">Pipeline Stages</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Customize your application pipeline. Drag to reorder, or add new
            stages.
          </p>
          <div className="space-y-2 mb-4">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                <GripVertical className="w-4 h-4 text-[var(--muted-foreground)] cursor-grab" />
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) =>
                    updateStage.mutate({
                      id: stage.id,
                      data: { color: e.target.value },
                    })
                  }
                  className="w-6 h-6 rounded border-0 cursor-pointer"
                />
                <span className="flex-1 text-sm font-medium">{stage.name}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {stage.slug}
                </span>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Delete "${stage.name}"? Applications in this stage will be moved to "Applied".`
                      )
                    )
                      deleteStage.mutate(stage.id);
                  }}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted-foreground)] hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newStageColor}
              onChange={(e) => setNewStageColor(e.target.value)}
              className="w-8 h-8 rounded border-0 cursor-pointer"
            />
            <input
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Stage name..."
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
            />
            <button
              onClick={handleAddStage}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </section>

        {/* Custom Properties */}
        <section className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-lg font-semibold mb-3">Custom Properties</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Add custom columns to track additional information per application.
          </p>
          <div className="space-y-2 mb-4">
            {properties.map((prop) => (
              <div
                key={prop.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                <span className="flex-1 text-sm font-medium">{prop.name}</span>
                <span className="text-xs text-[var(--muted-foreground)] px-2 py-0.5 rounded bg-[var(--secondary)]">
                  {prop.type}
                </span>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Delete "${prop.name}"? All values for this property will be lost.`
                      )
                    )
                      deleteProperty.mutate(prop.id);
                  }}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted-foreground)] hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {properties.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)] py-2">
                No custom properties yet.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newPropName}
              onChange={(e) => setNewPropName(e.target.value)}
              placeholder="Property name..."
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddProperty()}
            />
            <select
              value={newPropType}
              onChange={(e) => setNewPropType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddProperty}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
