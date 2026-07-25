"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, GripVertical, Key, Copy, Mail, CheckCircle, AlertCircle, RotateCcw, Loader2, Check } from "lucide-react";
import NavigationHeader from "@/components/NavigationHeader";
import { useQueryClient } from "@tanstack/react-query";
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
  const [apiKeysForm, setApiKeysForm] = useState({
    hunterKey: "",
    apolloKey: "",
    serperKey: "",
    geminiKey: "",
    tavilyKey: "",
    exaKey: ""
  });
  const [savingKeys, setSavingKeys] = useState(false);
  const [verifyingKeys, setVerifyingKeys] = useState(false);
  const [keyStatus, setKeyStatus] = useState<Record<string, { status: "idle" | "checking" | "valid" | "invalid"; message?: string }>>({});
  const [keysMessage, setKeysMessage] = useState<{type: "success"|"error", text: string}|null>(null);

  const [linkedAccounts, setLinkedAccounts] = useState<{ id: string; email: string; lastSyncedAt: string | null }[]>([]);
  const [gmailMessage, setGmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/extension/token")
      .then((r) => r.json())
      .then((d) => setApiKey(d.apiKey || ""))
      .catch(() => {});
      
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.apiKeys) {
          setApiKeysForm({
            hunterKey: d.apiKeys.hunterKey || "",
            apolloKey: d.apiKeys.apolloKey || "",
            serperKey: d.apiKeys.serperKey || "",
            geminiKey: d.apiKeys.geminiKey || "",
            tavilyKey: d.apiKeys.tavilyKey || "",
            exaKey: d.apiKeys.exaKey || ""
          });
        }
      })
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

  const handleVerifyKeys = async () => {
    setVerifyingKeys(true);
    setKeysMessage(null);
    const checkingState: Record<string, { status: "idle" | "checking" | "valid" | "invalid"; message?: string }> = {};
    Object.keys(apiKeysForm).forEach((k) => {
      if (apiKeysForm[k as keyof typeof apiKeysForm]?.trim()) {
        checkingState[k] = { status: "checking" };
      } else {
        checkingState[k] = { status: "idle" };
      }
    });
    setKeyStatus(checkingState);

    try {
      const res = await fetch("/api/verify-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKeysForm),
      });
      const data = await res.json();

      const updatedStatus: Record<string, any> = { ...keyStatus };
      const map: Record<string, string> = {
        geminiKey: "gemini",
        serperKey: "serper",
        hunterKey: "hunter",
        apolloKey: "apollo",
        tavilyKey: "tavily",
        exaKey: "exa",
      };

      Object.entries(map).forEach(([formKey, apiProp]) => {
        const val = apiKeysForm[formKey as keyof typeof apiKeysForm]?.trim();
        if (!val) {
          updatedStatus[formKey] = { status: "idle" };
          return;
        }
        const resObj = data[apiProp];
        if (resObj) {
          updatedStatus[formKey] = {
            status: resObj.valid ? "valid" : "invalid",
            message: resObj.message,
          };
        } else {
          updatedStatus[formKey] = { status: "invalid", message: "Verification failed" };
        }
      });
      setKeyStatus(updatedStatus);
      setKeysMessage({ type: "success", text: "Verification check completed!" });
      setTimeout(() => setKeysMessage(null), 3000);
    } catch (err) {
      console.error("Verification error:", err);
      setKeysMessage({ type: "error", text: "Failed to verify API keys" });
    } finally {
      setVerifyingKeys(false);
    }
  };

  const handleSaveApiKeys = async () => {
    setSavingKeys(true);
    setKeysMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKeysForm),
      });
      if (res.ok) {
        setKeysMessage({ type: "success", text: "API keys saved successfully!" });
        setTimeout(() => setKeysMessage(null), 3000);
      } else {
        const d = await res.json();
        setKeysMessage({ type: "error", text: d.error || "Failed to save keys" });
      }
    } catch (e) {
      setKeysMessage({ type: "error", text: "Failed to save API keys" });
    } finally {
      setSavingKeys(false);
    }
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
      <NavigationHeader />

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {/* Gmail Accounts */}
        <section className="p-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5" />
            Gmail Accounts
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Connect additional Gmail accounts to sync job emails. Your primary login account is always synced.
          </p>

          {gmailMessage && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-3 ${gmailMessage.type === "success" ? "bg-[#00d992]/10 text-[#00d992]" : "bg-red-500/10 text-red-400"}`}>
              {gmailMessage.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {gmailMessage.text}
            </div>
          )}

          {/* Primary account */}
          <div className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)] mb-2">
            <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
            <span className="flex-1 text-sm">{(session?.user as { email?: string })?.email || "Primary account"}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">Primary</span>
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
                className="p-1 rounded hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400"
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
        <section className="p-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
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

        {/* External API Keys */}
        <section className="p-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Key className="w-5 h-5" />
            External API Integrations
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Provide your API keys to enable automated research, email finding, and LLM drafting.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              { id: "hunterKey", label: "Hunter.io API Key", placeholder: "sk_..." },
              { id: "apolloKey", label: "Apollo.io API Key", placeholder: "sk_..." },
              { id: "serperKey", label: "Serper API Key", placeholder: "sk_..." },
              { id: "geminiKey", label: "Gemini API Key", placeholder: "AIza..." },
              { id: "tavilyKey", label: "Tavily API Key", placeholder: "tvly-..." },
              { id: "exaKey", label: "Exa API Key", placeholder: "exa_..." },
            ].map((field) => {
              const statusObj = keyStatus[field.id];
              return (
                <div key={field.id}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-[var(--muted-foreground)]">{field.label}</label>
                    {statusObj?.status === "checking" && (
                      <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                        <Loader2 className="w-3 h-3 animate-spin" /> Verifying
                      </span>
                    )}
                    {statusObj?.status === "valid" && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium" title={statusObj.message}>
                        <CheckCircle className="w-3 h-3" /> Valid
                      </span>
                    )}
                    {statusObj?.status === "invalid" && (
                      <span className="flex items-center gap-1 text-xs text-rose-400 font-medium max-w-[150px] truncate" title={statusObj.message}>
                        <AlertCircle className="w-3 h-3 shrink-0" /> {statusObj.message || "Invalid"}
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    value={apiKeysForm[field.id as keyof typeof apiKeysForm]}
                    onChange={(e) => {
                      setApiKeysForm(prev => ({ ...prev, [field.id]: e.target.value }));
                      setKeyStatus(prev => ({ ...prev, [field.id]: { status: "idle" } }));
                    }}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
                    placeholder={field.placeholder}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] mt-4">
            <div className="mt-4">
              {keysMessage && (
                <span className={`text-sm ${keysMessage.type === "success" ? "text-[#00d992]" : "text-red-400"}`}>
                  {keysMessage.text}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleVerifyKeys}
                disabled={verifyingKeys}
                className="px-4 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--secondary)] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                {verifyingKeys ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" /> Verify Keys
                  </>
                )}
              </button>
              <button
                onClick={handleSaveApiKeys}
                disabled={savingKeys}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {savingKeys ? "Saving..." : "Save API Keys"}
              </button>
            </div>
          </div>
        </section>

        {/* Custom Stages */}
        <section className="p-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
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
                  className="p-1 rounded hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400"
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
        <section className="p-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
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
                  className="p-1 rounded hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400"
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

        {/* Danger Zone */}
        <section className="p-5 rounded-lg border border-red-500/20 bg-red-500/5">
          <h2 className="text-lg font-semibold text-red-400 mb-1">Danger Zone</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            These actions are destructive and cannot be undone.
          </p>
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div>
              <div className="text-sm font-medium">Reset Gmail Data</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Deletes all Gmail-synced touchpoints and resets sync state. Run Sync afterwards to re-scan.
              </div>
            </div>
            <button
              onClick={async () => {
                if (!confirm("This will delete ALL Gmail-synced touchpoints. This cannot be undone. Continue?")) return;
                setResetting(true);
                try {
                  const res = await fetch("/api/gmail/reset", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) {
                    setGmailMessage({ type: "success", text: `Reset complete: ${data.touchpointsDeleted} touchpoints deleted. Run Sync to re-scan.` });
                    queryClient.invalidateQueries({ queryKey: ["applications"] });
                  } else {
                    setGmailMessage({ type: "error", text: `Reset failed: ${data.error}` });
                  }
                } catch {
                  setGmailMessage({ type: "error", text: "Reset failed. Check your connection." });
                }
                setResetting(false);
              }}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/20 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 shrink-0"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? "animate-spin" : ""}`} />
              {resetting ? "Resetting..." : "Reset Gmail Data"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
