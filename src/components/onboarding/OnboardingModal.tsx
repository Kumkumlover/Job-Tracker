"use client";

import React, { useState, useEffect } from "react";
import { Key, CheckCircle, AlertCircle, ExternalLink, Shield, Sparkles, Loader2, X, ArrowRight, Check } from "lucide-react";
import { useSession } from "next-auth/react";

interface KeyStatus {
  status: "idle" | "checking" | "valid" | "invalid";
  message?: string;
}

export function OnboardingModal() {
  const { data: session, status: authStatus } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);

  const [keys, setKeys] = useState({
    geminiKey: "",
    serperKey: "",
    hunterKey: "",
    apolloKey: "",
    tavilyKey: "",
    exaKey: "",
  });

  const [envKeysConfigured, setEnvKeysConfigured] = useState<Record<string, boolean>>({
    gemini: false,
    serper: false,
    hunter: false,
    apollo: false,
    tavily: false,
    exa: false,
  });

  const [keyStatus, setKeyStatus] = useState<Record<string, KeyStatus>>({
    geminiKey: { status: "idle" },
    serperKey: { status: "idle" },
    hunterKey: { status: "idle" },
    apolloKey: { status: "idle" },
    tavilyKey: { status: "idle" },
    exaKey: { status: "idle" },
  });

  useEffect(() => {
    if (authStatus !== "authenticated") return;

    // Check localStorage to see if onboarding was already completed or skipped
    const skipped = localStorage.getItem("has_completed_onboarding_v1");
    if (skipped === "true") {
      setLoading(false);
      return;
    }

    // Fetch existing settings
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.apiKeys) {
          const loadedKeys = {
            geminiKey: data.apiKeys.geminiKey || "",
            serperKey: data.apiKeys.serperKey || "",
            hunterKey: data.apiKeys.hunterKey || "",
            apolloKey: data.apiKeys.apolloKey || "",
            tavilyKey: data.apiKeys.tavilyKey || "",
            exaKey: data.apiKeys.exaKey || "",
          };
          setKeys(loadedKeys);

          if (data?.envKeys) {
            setEnvKeysConfigured(data.envKeys);
          }

          // If core keys are missing (both in DB and env), show modal!
          const hasGemini = loadedKeys.geminiKey || data.envKeys?.gemini;
          const hasSerper = loadedKeys.serperKey || data.envKeys?.serper;

          if (!hasGemini || !hasSerper) {
            setIsOpen(true);
          } else {
            // Already configured, mark complete
            localStorage.setItem("has_completed_onboarding_v1", "true");
          }
        } else {
          setIsOpen(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authStatus]);

  const handleVerifyAll = async () => {
    setVerifyingAll(true);
    const checkingState: Record<string, KeyStatus> = {};
    Object.keys(keys).forEach((k) => {
      if (keys[k as keyof typeof keys].trim()) {
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
        body: JSON.stringify(keys),
      });
      const data = await res.json();

      const updatedStatus: Record<string, KeyStatus> = { ...keyStatus };
      const map: Record<string, string> = {
        geminiKey: "gemini",
        serperKey: "serper",
        hunterKey: "hunter",
        apolloKey: "apollo",
        tavilyKey: "tavily",
        exaKey: "exa",
      };

      Object.entries(map).forEach(([formKey, apiProp]) => {
        const val = keys[formKey as keyof typeof keys].trim();
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
    } catch (err) {
      console.error("Verification error:", err);
    } finally {
      setVerifyingAll(false);
    }
  };

  const handleSaveAndContinue = async () => {
    setSaving(true);
    // Build payload containing ONLY the keys that were NOT configured via env
    // and that actually have a value
    const payloadToSave: Record<string, string> = {};
    Object.keys(keys).forEach(k => {
      // @ts-ignore
      if (!envKeysConfigured[k.replace('Key', '')] && keys[k]) {
        payloadToSave[k] = keys[k as keyof typeof keys];
      }
    });

    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSave),
      });
      localStorage.setItem("has_completed_onboarding_v1", "true");
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to save keys:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("has_completed_onboarding_v1", "true");
    setIsOpen(false);
  };

  if (loading || !isOpen) return null;

  const providers = [
    {
      id: "geminiKey",
      label: "Google Gemini API Key",
      desc: "Powers AI candidate ranking & personalized email generation.",
      link: "https://aistudio.google.com/app/apikey",
      required: true,
    },
    {
      id: "serperKey",
      label: "Serper.dev API Key",
      desc: "Fast Google Search API for discovering LinkedIn profiles.",
      link: "https://serper.dev",
      required: true,
    },
    {
      id: "hunterKey",
      label: "Hunter.io API Key",
      desc: "Finds and verifies professional corporate email addresses.",
      link: "https://hunter.io",
      required: false,
    },
    {
      id: "apolloKey",
      label: "Apollo.io API Key",
      desc: "Enriches candidate profiles with B2B direct dials and emails.",
      link: "https://apollo.io",
      required: false,
    },
    {
      id: "tavilyKey",
      label: "Tavily AI Search Key",
      desc: "Deep AI web search fallback for exhaustive research.",
      link: "https://tavily.com",
      required: false,
    },
    {
      id: "exaKey",
      label: "Exa.ai API Key",
      desc: "Neural semantic search engine for finding hidden talent.",
      link: "https://exa.ai",
      required: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-2xl overflow-hidden border bg-[var(--card)] border-[var(--border)] rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)] bg-gradient-to-r from-[var(--primary)]/10 via-transparent to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--primary)]/20 text-[var(--primary)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">Welcome to Antigravity OS</h2>
                <p className="text-xs text-[var(--muted-foreground)]">Connect your API keys to unlock autonomous recruiting & outreach.</p>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--secondary)] transition-colors"
              title="Skip for now"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[65vh] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between px-3 py-2 text-xs border rounded-lg bg-[var(--secondary)]/50 border-[var(--border)] text-[var(--muted-foreground)]">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" /> All keys are securely stored and encrypted in your workspace.
            </span>
            <button
              onClick={handleVerifyAll}
              disabled={verifyingAll}
              className="flex items-center gap-1.5 font-medium text-[var(--primary)] hover:underline disabled:opacity-50"
            >
              {verifyingAll ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Verifying...
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" /> Verify All Keys
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            {providers.map((p) => {
              const statusObj = keyStatus[p.id];
              return (
                <div key={p.id} className="p-4 transition-colors border rounded-xl border-[var(--border)] bg-[var(--background)]/50 hover:border-[var(--primary)]/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Key className="w-4 h-4 text-[var(--primary)]" />
                      {p.label}
                      {p.required && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Required</span>}
                    </label>
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
                    >
                      Get Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-2.5">{p.desc}</p>
                  
                  <div className="relative">
                    <input
                      type="password"
                      placeholder={envKeysConfigured[p.id.replace('Key', '')] ? "Configured via environment" : `Paste ${p.label}...`}
                      value={envKeysConfigured[p.id.replace('Key', '')] ? "••••••••••••••••" : keys[p.id as keyof typeof keys]}
                      disabled={envKeysConfigured[p.id.replace('Key', '')]}
                      onChange={(e) => {
                        setKeys({ ...keys, [p.id]: e.target.value });
                        setKeyStatus({ ...keyStatus, [p.id]: { status: "idle" } });
                      }}
                      className="w-full px-3.5 py-2 text-sm font-mono border rounded-lg bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] pr-28 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    
                    <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
                      {envKeysConfigured[p.id.replace('Key', '')] && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md font-medium">
                          <CheckCircle className="w-3 h-3" /> Valid (.env)
                        </span>
                      )}
                      {!envKeysConfigured[p.id.replace('Key', '')] && statusObj?.status === "checking" && (
                        <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] bg-[var(--secondary)] px-2 py-1 rounded-md">
                          <Loader2 className="w-3 h-3 animate-spin" /> Verifying
                        </span>
                      )}
                      {!envKeysConfigured[p.id.replace('Key', '')] && statusObj?.status === "valid" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md font-medium" title={statusObj.message}>
                          <CheckCircle className="w-3 h-3" /> Valid
                        </span>
                      )}
                      {!envKeysConfigured[p.id.replace('Key', '')] && statusObj?.status === "invalid" && (
                        <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-md font-medium max-w-[140px] truncate" title={statusObj.message}>
                          <AlertCircle className="w-3 h-3 shrink-0" /> {statusObj.message || "Invalid"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 px-6 border-t border-[var(--border)] bg-[var(--secondary)]/30">
          <button
            onClick={handleSkip}
            className="text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Skip & Configure Later
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyAll}
              disabled={verifyingAll}
              className="px-4 py-2 text-xs font-semibold transition-colors border rounded-lg border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--secondary)] disabled:opacity-50 flex items-center gap-1.5"
            >
              {verifyingAll && <Loader2 className="w-3 h-3 animate-spin" />} Verify Keys
            </button>
            <button
              onClick={handleSaveAndContinue}
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white transition-all rounded-lg bg-[var(--primary)] hover:opacity-90 shadow-lg shadow-[var(--primary)]/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  Save & Continue <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
