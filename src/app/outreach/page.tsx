"use client";

import React, { useState, useEffect, useRef } from "react";
import {
 Search,
 Users,
 Mail,
 Send,
 CheckCircle,
 AlertCircle,
 Loader2,
 ChevronRight,
 ExternalLink,
 UserCheck,
 Shield,
 Zap,
 Edit3,
 Copy,
 ArrowRight,
 Briefcase,
 Key,
 Settings,
 Target,
 Sparkles,
 ChevronDown,
 ChevronUp,
 FileText,
} from "lucide-react";
import { UsageTracker, type LocalUsage } from "@/components/automation/usage-tracker";

// ─── Types ──────────────────────────────────────────────────────

interface RankedCandidate {
 name: string;
 profile_url: string;
 current_title: string;
 role_type: "hiring_manager" | "team_lead" | "recruiter_hr" | "other";
 confidence: number;
 reason: string;
 email?: string;
}

interface EmailData {
 email: string;
 type: "verified" | "discovered" | "predicted";
 confidence: number;
 source: string;
}

interface PersonResult {
 name: string;
 company: string;
 domain: string;
 emails: EmailData[];
 recommended: string | null;
}

interface EmailDraft {
 toEmail: string;
 bccEmails?: string;
 toName: string;
 subject: string;
 htmlBody: string;
 rawText?: string;
 reason: string;
}

type Step = 1 | 2 | 3 | 4 | 5;
type PhaseStatus = "idle" | "loading" | "success" | "error";

// ─── Helpers ────────────────────────────────────────────────────

function roleTypeLabel(rt: string) {
 switch (rt) {
 case "hiring_manager": return "Hiring Manager";
 case "team_lead": return "Team Lead";
 case "recruiter_hr": return "HR / Recruiter";
 default: return "Other";
 }
}

function roleTypeColor(rt: string) {
 switch (rt) {
 case "hiring_manager": return "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20";
 case "team_lead": return "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20";
 case "recruiter_hr": return "bg-[var(--secondary)] text-[var(--muted-foreground)] border-[var(--border)]";
 default: return "bg-[var(--secondary)] text-[var(--muted-foreground)] border-[var(--border)]";
 }
}

function buildGmailDraftUrl(draft: EmailDraft): string {
 // Convert HTML to plain text for Gmail compose
 const plainBody = draft.htmlBody
 .replace(/<br\s*\/?>/gi, "\n")
 .replace(/<\/p>/gi, "\n\n")
 .replace(/<\/li>/gi, "\n")
 .replace(/<li>/gi, "• ")
 .replace(/<\/ul>/gi, "\n")
 .replace(/<[^>]*>/g, "")
 .replace(/&nbsp;/g, " ")
 .replace(/&amp;/g, "&")
 .replace(/&lt;/g, "<")
 .replace(/&gt;/g, ">")
 .replace(/&quot;/g, '"')
 .replace(/&#039;/g, "'")
 .replace(/\n{3,}/g, "\n\n")
 .trim();

 const params = new URLSearchParams({
 view: "cm",
 fs: "1",
 to: draft.toEmail,
 su: draft.subject,
 });

 if (draft.bccEmails) {
 params.append("bcc", draft.bccEmails);
 }

 return `https://mail.google.com/mail/?${params.toString()}`;
}

// ─── Component ──────────────────────────────────────────────────

export default function OutreachPage() {
 // Step state
 const [step, setStep] = useState<Step>(1);
 const [phaseStatus, setPhaseStatus] = useState<PhaseStatus>("idle");
 const [loadingAction, setLoadingAction] = useState<"contacts" | "cycle" | "emails" | "drafts" | null>(null);
 const [error, setError] = useState("");

 // API Keys
 const [apiKeys, setApiKeys] = useState({ hunter: "", apollo: "", serper: "", gemini: "" });
 const [showKeys, setShowKeys] = useState(false);
 const [savingKeys, setSavingKeys] = useState(false);

 const [isMounted, setIsMounted] = useState(false);
 const [userProfile, setUserProfile] = useState<any>(null);

 // Step 1: Input
 const [company, setCompany] = useState("");
 const [jobTitle, setJobTitle] = useState("");
 const [jd, setJd] = useState("");
 const [companyWebsite, setCompanyWebsite] = useState("");

 // Step 2: Contacts
 const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
 const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
 // Cumulative exclusion list — grows across ALL cycles so no one can reappear
 const [seenNames, setSeenNames] = useState<Set<string>>(new Set());

 // Step 3: Emails
 const [emailResults, setEmailResults] = useState<PersonResult[]>([]);
 const [selectedEmails, setSelectedEmails] = useState<Map<string, string>>(new Map());

 // Step 4: Template
 const [masterDrafts, setMasterDrafts] = useState<(EmailDraft & { problemTitle?: string })[]>([]);
 const [selectedMasterIdx, setSelectedMasterIdx] = useState<number>(0);

 // Step 5: Draft & Send
 const [drafts, setDrafts] = useState<EmailDraft[]>([]);
 const [editingDraftIdx, setEditingDraftIdx] = useState<number | null>(null);
 const [editSubject, setEditSubject] = useState("");
 const [editBody, setEditBody] = useState("");
 const [sendStatus, setSendStatus] = useState<Map<string, "idle" | "sending" | "sent" | "error">>(new Map());
 const [copied, setCopied] = useState<string | null>(null);
 const [isGmailConnected, setIsGmailConnected] = useState(false);

 // Live API Usage Tracker State
 const [localUsage, setLocalUsage] = useState<LocalUsage>({ search: 0, apollo: 0, hunter: 0 });

 // Load saved state on mount
 useEffect(() => {
 setIsMounted(true);

 fetch("/api/settings")
 .then((res) => res.json())
 .then((data) => {
 if (data.apiKeys) {
 setApiKeys({
 hunter: data.apiKeys.hunterKey || "",
 apollo: data.apiKeys.apolloKey || "",
 serper: data.apiKeys.serperKey || "",
 gemini: data.apiKeys.geminiKey || "",
 });
 }
 if (data.profile) {
 setUserProfile(data.profile);
 }
 })
 .catch((err) => console.error("Failed to load settings:", err));

 const savedCompany = localStorage.getItem("outreach_company");
 if (savedCompany) setCompany(savedCompany);
 const savedJobTitle = localStorage.getItem("outreach_jobTitle");
 if (savedJobTitle) setJobTitle(savedJobTitle);
 const savedJd = localStorage.getItem("outreach_jd");
 if (savedJd) setJd(savedJd);
 const savedCompanyWebsite = localStorage.getItem("outreach_companyWebsite");
 if (savedCompanyWebsite) setCompanyWebsite(savedCompanyWebsite);

  const savedCandidates = localStorage.getItem("outreach_candidates");
  if (savedCandidates) {
    // Deduplicate by name on restore to fix any stale duplicated state
    const raw: RankedCandidate[] = JSON.parse(savedCandidates);
    const deduped = raw.filter((c, idx, arr) =>
      arr.findIndex(x => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()) === idx
    );
    setCandidates(deduped);
  }
  const savedSelectedContacts = localStorage.getItem("outreach_selectedContacts");
  if (savedSelectedContacts) setSelectedContacts(new Set(JSON.parse(savedSelectedContacts)));
  // Restore seenNames so cycle exclusions survive page refreshes
  const savedSeenNames = localStorage.getItem("outreach_seenNames");
  if (savedSeenNames) setSeenNames(new Set(JSON.parse(savedSeenNames)));

  const savedEmailResults = localStorage.getItem("outreach_emailResults");
  if (savedEmailResults) setEmailResults(JSON.parse(savedEmailResults));
  const savedSelectedEmails = localStorage.getItem("outreach_selectedEmails");
  if (savedSelectedEmails) setSelectedEmails(new Map(JSON.parse(savedSelectedEmails)));

  const savedDrafts = localStorage.getItem("outreach_drafts");
  if (savedDrafts) setDrafts(JSON.parse(savedDrafts));
  const savedStep = localStorage.getItem("outreach_step");
  if (savedStep) setStep(Number(savedStep) as Step);


 fetch("/api/gmail/status")
 .then(res => res.json())
 .then(data => {
 if (data.connected) setIsGmailConnected(true);
 })
 .catch(console.error);
 }, []);

 // Save state on change
 useEffect(() => {
 localStorage.setItem("outreach_company", company);
 localStorage.setItem("outreach_jobTitle", jobTitle);
 localStorage.setItem("outreach_jd", jd);
 localStorage.setItem("outreach_companyWebsite", companyWebsite);
 localStorage.setItem("outreach_candidates", JSON.stringify(candidates));
 localStorage.setItem("outreach_selectedContacts", JSON.stringify(Array.from(selectedContacts)));
 localStorage.setItem("outreach_emailResults", JSON.stringify(emailResults));
 localStorage.setItem("outreach_selectedEmails", JSON.stringify(Array.from(selectedEmails.entries())));
 localStorage.setItem("outreach_drafts", JSON.stringify(drafts));
 localStorage.setItem("outreach_step", String(step));
 // Persist seenNames so cycle exclusions survive page refreshes
 localStorage.setItem("outreach_seenNames", JSON.stringify(Array.from(seenNames)));
 }, [company, jobTitle, jd, companyWebsite, candidates, selectedContacts, emailResults, selectedEmails, drafts, step, seenNames]);

 const handleReset = () => {
 if (!window.confirm("Are you sure you want to start over? This will clear your current candidates and progress.")) return;
 setCompany("");
 setJobTitle("");
 setJd("");
 setCompanyWebsite("");
 setCandidates([]);
 setSelectedContacts(new Set());
 setEmailResults([]);
 setSelectedEmails(new Map());
 setMasterDrafts([]);
 setSelectedMasterIdx(0);
 setDrafts([]);
 setEditingDraftIdx(null);
 setEditSubject("");
 setEditBody("");
 setStep(1);
 setPhaseStatus("idle");
 setError("");
 setLocalUsage({ search: 0, apollo: 0, hunter: 0 });
 setSeenNames(new Set());
 localStorage.removeItem("outreach_company");
 localStorage.removeItem("outreach_jobTitle");
 localStorage.removeItem("outreach_jd");
 localStorage.removeItem("outreach_companyWebsite");
 localStorage.removeItem("outreach_candidates");
 localStorage.removeItem("outreach_selectedContacts");
 localStorage.removeItem("outreach_emailResults");
 localStorage.removeItem("outreach_selectedEmails");
 localStorage.removeItem("outreach_drafts");
 localStorage.removeItem("outreach_step");
 localStorage.removeItem("outreach_seenNames");
 };

 // ── Step 1: Find Contacts ──

 const handleFindContacts = async (isCycle = false) => {
 if (!company.trim() || !jobTitle.trim()) {
 setError("Please enter both Company and Job Title.");
 return;
 }

 const keptCandidates = isCycle 
 ? candidates.filter((_, i) => selectedContacts.has(i))
 : [];
 
 // On a fresh search, reset the seen names. On cycle, pass ALL ever-seen names.
 const excludeNames = isCycle
 ? [...seenNames] // Use the full cumulative set — not just current page
 : [];

 // Also reset seenNames on a fresh search
 if (!isCycle) setSeenNames(new Set());


 setPhaseStatus("loading");
 setLoadingAction(isCycle ? "cycle" : "contacts");
 setError("");

 try {
 const res = await fetch("/api/outreach", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: "find-contacts",
 company: company.trim(),
 jobTitle: jobTitle.trim(),
 jd: jd.trim() || undefined,
 excludeNames,
 }),
 });

 if (!res.ok) {
 const d = await res.json().catch(() => ({}));
 throw new Error(d.error || `Server error: ${res.status}`);
 }

  const data = await res.json();
  const newRanked: RankedCandidate[] = data.rankedCandidates || [];
  const rawCombined = [...keptCandidates, ...newRanked];
  // Deduplicate by name (case-insensitive) — last line of defense against any source of duplicates
  const combinedCandidates = rawCombined.filter((c, idx, arr) =>
    arr.findIndex(x => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()) === idx
  );

 // Accumulate all seen names to prevent any reappearance across future cycles
 setSeenNames(prev => {
  const next = new Set(prev);
  for (const c of combinedCandidates) next.add(c.name.trim().toLowerCase());
  return next;
 });

 // Update local usage safely
 if (data.localApiUsage) {
 setLocalUsage((prev) => ({
 ...prev,
 search: prev.search + (data.localApiUsage.search || 0),
 }));
 }

 setCandidates(combinedCandidates);

 // Auto-select all
 setSelectedContacts(new Set(combinedCandidates.map((_: RankedCandidate, i: number) => i)));
 
 // Clear stale downstream states
 setEmailResults([]);
 setSelectedEmails(new Map());
 setDrafts([]);
 
 setStep(2);
 setPhaseStatus("success");
 } catch (err) {
 setError((err as Error).message);
 setPhaseStatus("error");
 setLoadingAction(null);
 }
 };

 // ── Step 2: Find Emails ──

 const handleFindEmails = async () => {
 const selected = candidates.filter((_, i) => selectedContacts.has(i));
 if (!selected.length) {
 setError("Please select at least one contact.");
 return;
 }

 setPhaseStatus("loading");
 setLoadingAction("emails");
 setError("");
 setEmailResults([]);
 setSelectedEmails(new Map());

  try {
    const contacts = selected.map((c) => ({
      name: c.name,
      company: company.trim(),
      domain: companyWebsite.trim() || "",
      email: c.email,
    }));

    const allResults: PersonResult[] = [];
    const autoSelect = new Map<string, string>();

    // Send all contacts in one batch so the backend can correctly group Verification vs Pattern Engine
    const res = await fetch("/api/outreach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hunter-Key": apiKeys.hunter,
        "X-Apollo-Key": apiKeys.apollo,
      },
      body: JSON.stringify({
        action: "find-emails",
        contacts: contacts,
        hunterKey: apiKeys.hunter,
        apolloKey: apiKeys.apollo,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to find emails for ${company}`);
    }

    const data = await res.json();
    
    if (data.localApiUsage) {
      setLocalUsage((prev) => ({
        ...prev,
        apollo: prev.apollo + (data.localApiUsage.apollo || 0),
        hunter: prev.hunter + (data.localApiUsage.hunter || 0),
      }));
    }

    const results: PersonResult[] = data.emailResults || [];
    allResults.push(...results);

 // Count total emails found across all people (any type — verified, predicted, discovered)
 const totalEmailsFound = allResults.reduce((sum, r) => sum + r.emails.length, 0);

 if (totalEmailsFound === 0) {
  const missingKeys: string[] = [];
  if (!apiKeys.hunter.trim()) missingKeys.push("Hunter.io");
  if (!apiKeys.apollo.trim()) missingKeys.push("Apollo.io");
  if (missingKeys.length > 0) {
   throw new Error(
    `No emails found. You haven't added your ${missingKeys.join(" or ")} API key. ` +
    `Click "API Keys" above to add your key — both services have a free tier. ` +
    `The pattern engine also ran but couldn't generate predictions without a known domain. ` +
    `Try adding the company website above (e.g. fixerra.com) and retry.`
   );
  }
  throw new Error("No emails could be found for the selected contacts. The email finder tried Hunter.io, Apollo.io, public web search and the pattern engine but came up empty. Try adding the company website domain above and retry.");
 }

 setEmailResults(allResults);

 // Auto-select recommended emails
 for (const r of allResults) {
 if (r.recommended) {
 const recommendedInfo = r.emails.find((e) => e.email === r.recommended);
 if (recommendedInfo?.type === "predicted") {
 const allPredicted = r.emails
 .filter((e) => e.type === "predicted")
 .map((e) => e.email);
 autoSelect.set(r.name, allPredicted.join("|"));
 } else {
 autoSelect.set(r.name, r.recommended);
 }
 } else if (r.emails.length > 0) {
 autoSelect.set(r.name, r.emails[0].email);
 }
 }
 setSelectedEmails(autoSelect);

 setStep(3);
 setPhaseStatus("success");
 } catch (err) {
 setError((err as Error).message);
 setPhaseStatus("error");
 setLoadingAction(null);
 }
 };

 // ── Step 3: Generate Emails ──

 const handleGenerateEmails = async () => {
 const targets = Array.from(selectedEmails.entries()).filter(([_, email]) => email);
 if (!targets.length) {
 setError("Please select at least one email to target.");
 return;
 }

 setPhaseStatus("loading");
 setLoadingAction("drafts");
 setError("");

 try {
 const firstTargetName = targets[0][0];
 const candidate = candidates.find(c => c.name === firstTargetName);

 const res = await fetch("/api/outreach", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: "generate-email",
 recipientName: "{{contactName}}", // Force template placeholder
 company: company.trim(),
 jobTitle: jobTitle.trim(),
 jd: jd.trim() || undefined,
 profileUrl: candidate?.profile_url,
 }),
 });

 if (!res.ok) {
 const errBody = await res.text().catch(() => "");
 throw new Error(`Error generating master template: ${errBody.slice(0, 100)}`);
 }

 const data = await res.json();
 
 if (data.drafts && data.drafts.length > 0) {
 setMasterDrafts(data.drafts.map((d: any) => ({
 toEmail: "", // Will be assigned per person
 bccEmails: "",
 toName: "",
 subject: d.subject,
 htmlBody: d.htmlBody,
 rawText: d.rawText,
 reason: d.reason,
 problemTitle: d.problemTitle,
 })));
 } else {
 throw new Error("No drafts returned from API");
 }
 setSelectedMasterIdx(0);

 setStep(4);
 setPhaseStatus("success");
 setLoadingAction(null);
 } catch (err) {
 setError((err as Error).message);
 setPhaseStatus("error");
 setLoadingAction(null);
 }
 };

 // ── Step 4: Apply Master Draft ──

 const handleApproveMasterDraft = () => {
 if (masterDrafts.length === 0) return;
 const masterDraft = masterDrafts[0]; // Always 1 draft now

 // The backend already built the HTML; just use it as-is.
 // The {{contactName}} placeholder will be swapped per-person below.
 const formattedHtmlBody = masterDraft.htmlBody;

 const targets = Array.from(selectedEmails.entries()).filter(([_, email]) => email);
 const newDrafts: EmailDraft[] = [];

 for (const [name, emailsStr] of targets) {
 const emailParts = emailsStr.split("|");
 const primaryEmail = emailParts[0];
 const bccEmails = emailParts.length > 1 ? emailParts.slice(1).join(", ") : undefined;
 const firstName = name.split(" ")[0];

 newDrafts.push({
 toEmail: primaryEmail,
 bccEmails,
 toName: name,
 subject: masterDraft.subject,
 htmlBody: formattedHtmlBody.replace(/\{\{contactName\}\}/g, firstName),
 reason: masterDraft.reason,
 });
 }

 setDrafts(newDrafts);
 setSendStatus(new Map(newDrafts.map((d) => [d.toEmail, "idle"])));
 setStep(5);
 };

 // ── Step 4: Send Email ──

 const handleSendEmail = async (draft: EmailDraft) => {
 setSendStatus((prev) => new Map(prev).set(draft.toEmail, "sending"));

 try {
 const res = await fetch("/api/outreach", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: "send-email",
 toEmail: draft.toEmail,
 toName: draft.toName,
 subject: draft.subject,
 htmlBody: draft.htmlBody,
 company: company.trim(),
 jobTitle: jobTitle.trim(),
 }),
 });

 if (!res.ok) throw new Error("Failed to send");

 setSendStatus((prev) => new Map(prev).set(draft.toEmail, "sent"));
 } catch {
 setSendStatus((prev) => new Map(prev).set(draft.toEmail, "error"));
 }
 };

 const handleSaveEdit = (idx: number) => {
 setDrafts((prev) => {
 const next = [...prev];
 next[idx] = { ...next[idx], subject: editSubject, htmlBody: editBody };
 return next;
 });
 setEditingDraftIdx(null);
 };

 const handleCopyHtml = async (draft: EmailDraft, id: string) => {
 try {
 const plainText = draft.htmlBody.replace(/<[^>]*>/g, "");
 const htmlBlob = new Blob([draft.htmlBody], { type: "text/html" });
 const plainBlob = new Blob([plainText], { type: "text/plain" });
 const item = new ClipboardItem({
 "text/html": htmlBlob,
 "text/plain": plainBlob,
 });
 await navigator.clipboard.write([item]);
 setCopied(id);
 setTimeout(() => setCopied(null), 2000);
 } catch (err) {
 console.error("Failed to copy rich text", err);
 // Fallback
 const plainText = draft.htmlBody.replace(/<[^>]*>/g, "");
 navigator.clipboard.writeText(plainText);
 setCopied(id);
 setTimeout(() => setCopied(null), 2000);
 }
 };

 const handleOpenInGmail = async (draft: EmailDraft) => {
 // 1. Copy the rich text HTML to clipboard so the user can easily paste it.
 await handleCopyHtml(draft, draft.toEmail + "_gmail");
 // 2. Open Gmail compose window with empty body (since it doesn't support HTML)
 window.open(buildGmailDraftUrl(draft), "_blank", "noopener,noreferrer");
 };

 const handleCreateApiDraft = async (draft: EmailDraft) => {
 try {
 setSendStatus((prev) => new Map(prev).set(draft.toEmail, "sending"));
 
 const res = await fetch("/api/gmail/draft", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 toEmail: draft.toEmail,
 bccEmails: draft.bccEmails,
 subject: draft.subject,
 htmlBody: draft.htmlBody,
 }),
 });

 if (!res.ok) throw new Error("Failed to create draft");

 setSendStatus((prev) => new Map(prev).set(draft.toEmail, "sent"));
 } catch {
 setSendStatus((prev) => new Map(prev).set(draft.toEmail, "error"));
 }
 };

 // ── Step indicator ──

 const steps = [
 { num: 1, label: "Target", icon: Target },
 { num: 2, label: "Contacts", icon: Users },
 { num: 3, label: "Emails", icon: Mail },
 { num: 4, label: "Send", icon: Send },
 ];

 // ── Render ──

 return (
 <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans">
 
 <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-10 space-y-8">
 {/* Header */}
 <header className="space-y-2">
 <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
 <div className="p-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl">
 <Zap className="w-7 h-7 text-[var(--primary)]" />
 </div>
 Outreach Automation
 </h1>
 <p className="text-[var(--muted-foreground)] text-lg">
 Find decision makers → Discover emails → Generate & send personalized outreach
 </p>
 </header>

 {/* Step Navigation & Reset */}
 <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
 <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
 {steps.map((s, idx) => (
 <React.Fragment key={s.num}>
 <button
 disabled={s.num > step}
 onClick={() => setStep(s.num as Step)}
 className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
 s.num === step
 ? "bg-[var(--primary)]/10 text-[var(--primary)]"
 : s.num < step
 ? "text-[var(--primary)] hover:bg-[var(--secondary)]"
 : "text-slate-600 opacity-50 cursor-not-allowed"
 }`}
 >
 {s.num < step ? (
 <CheckCircle className="w-4 h-4" />
 ) : (
 <s.icon className="w-4 h-4" />
 )}
 <span className="hidden sm:inline">{s.label}</span>
 <span className="sm:hidden">{s.num}</span>
 </button>
 {idx < steps.length - 1 && (
 <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
 )}
 </React.Fragment>
 ))}
 </div>
 {step > 1 && (
 <button
 onClick={handleReset}
 className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0"
 >
 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
 <span className="hidden sm:inline">Start Over</span>
 </button>
 )}
 </div>
 {/* API Keys Panel */}
 <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
 <button
 type="button"
 onClick={() => setShowKeys(!showKeys)}
 className="w-full px-6 py-3 flex items-center justify-between hover:bg-[var(--card-hover)] transition-colors"
 >
 <div className="flex items-center gap-2">
 <Settings className="w-4 h-4 text-[var(--muted-foreground)]" />
 <span className="text-sm font-medium text-[var(--muted-foreground)]">API Keys (Saved Securely)</span>
 {apiKeys.hunter && (
 <span className="text-[10px] px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full border border-[var(--primary)]/20">
 Hunter ✓
 </span>
 )}
 {apiKeys.apollo && (
 <span className="text-[10px] px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full border border-[var(--primary)]/20">
 Apollo ✓
 </span>
 )}
 </div>
 <span className="text-xs text-[var(--muted-foreground)]">{showKeys ? "Hide" : "Show"}</span>
 </button>
 {showKeys && (
 <div className="px-6 pb-4 pt-4 border-t border-[var(--border)]">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
 <div className="space-y-1.5">
 <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1">
 <Key className="w-3 h-3 text-orange-400" /> Hunter.io API Key
 </label>
 <input
 type="password"
 placeholder="Enter Hunter key..."
 value={apiKeys.hunter}
 onChange={(e) => setApiKeys((p) => ({ ...p, hunter: e.target.value }))}
 className="w-full px-3 py-2 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--primary)]/40 outline-none"
 />
 </div>
 <div className="space-y-1.5">
 <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1">
 <Key className="w-3 h-3 text-[var(--primary)]" /> Apollo.io API Key
 </label>
 <input
 type="password"
 placeholder="Enter Apollo key..."
 value={apiKeys.apollo}
 onChange={(e) => setApiKeys((p) => ({ ...p, apollo: e.target.value }))}
 className="w-full px-3 py-2 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--primary)]/40 outline-none"
 />
 </div>
 </div>
 <button
 onClick={async () => {
 setSavingKeys(true);
 try {
 await fetch("/api/settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 hunterKey: apiKeys.hunter,
 apolloKey: apiKeys.apollo,
 })
 });
 } catch (e) {
 console.error(e);
 } finally {
 setSavingKeys(false);
 }
 }}
 disabled={savingKeys}
 className="px-4 py-2 bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 text-[var(--primary-foreground)] rounded-lg text-sm font-medium transition-all w-full md:w-auto"
 >
 {savingKeys ? "Saving..." : "Save Keys"}
 </button>
 </div>
 )}
 </div>

 {/* Error */}
 {error && (
 <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-5 py-3 rounded-xl flex items-center gap-3 text-sm">
 <AlertCircle className="w-4 h-4 flex-shrink-0" />
 <p>{error}</p>
 <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-200 text-xs">✕</button>
 </div>
 )}

 {/* ═══════ STEP 1: TARGET INPUT ═══════ */}
 {step === 1 && (
 <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 space-y-6">
 <div className="flex items-center gap-3 mb-2">
 <Target className="w-5 h-5 text-[var(--primary)]" />
 <h2 className="text-lg font-bold text-[var(--foreground)]">Define Your Target</h2>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
 <div className="space-y-1.5">
 <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Company *</label>
 <input
 type="text"
 placeholder="e.g. Razorpay"
 value={company}
 onChange={(e) => setCompany(e.target.value)}
 className="w-full px-4 py-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/30 outline-none transition-all"
 />
 </div>
 <div className="space-y-1.5">
 <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Job Title / Role *</label>
 <input
 type="text"
 placeholder="e.g. Product Manager"
 value={jobTitle}
 onChange={(e) => setJobTitle(e.target.value)}
 className="w-full px-4 py-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/30 outline-none transition-all"
 />
 </div>
 </div>

 <div className="space-y-1.5">
 <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Company Website / Domain (Optional)</label>
 <input
 type="text"
 placeholder="e.g. razorpay.com"
 value={companyWebsite}
 onChange={(e) => setCompanyWebsite(e.target.value)}
 className="w-full px-4 py-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/30 outline-none transition-all"
 />
 </div>

 <div className="space-y-1.5">
 <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Job Description (Optional)</label>
 <textarea
 placeholder="Paste the JD here to help find the right decision makers..."
 rows={4}
 value={jd}
 onChange={(e) => setJd(e.target.value)}
 className="w-full px-4 py-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/30 outline-none transition-all resize-none"
 />
 </div>

 <button
 onClick={() => handleFindContacts(false)}
 disabled={phaseStatus === "loading" || !company.trim() || !jobTitle.trim()}
 className="w-full py-4 bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] font-bold rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-3 active:scale-[0.99]"
 >
 {phaseStatus === "loading" && loadingAction === "contacts" ? (
 <Loader2 className="w-5 h-5 animate-spin" />
 ) : (
 <Search className="w-5 h-5" />
 )}
 {phaseStatus === "loading" ? "Searching for Decision Makers..." : "Find Decision Makers"}
 </button>
 </div>
 )}

 {/* ═══════ STEP 2: CONTACTS FOUND ═══════ */}
 {step === 2 && (
 <div className="space-y-6">
 <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <Users className="w-5 h-5 text-[var(--primary)]" />
 <div>
 <h2 className="text-lg font-bold text-[var(--foreground)]">Decision Makers Found</h2>
 <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
 {candidates.length} people identified at {company} for {jobTitle}
 </p>
 </div>
 </div>
 <button
 onClick={() => setStep(1)}
 className="text-xs text-[var(--primary)] border border-[var(--primary)]/20 px-3 py-1.5 rounded-lg hover:bg-[var(--primary)]/10"
 >
 ← Back
 </button>
 </div>

 <div className="space-y-3">
 {candidates.map((c, idx) => (
 <label
 key={idx}
 className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
 selectedContacts.has(idx)
 ? "bg-[var(--primary)]/5 border-[var(--primary)]/30"
 : "bg-[var(--background)] border-[var(--border)] hover:border-[var(--border)]"
 }`}
 >
 <input
 type="checkbox"
 checked={selectedContacts.has(idx)}
 onChange={() => {
 setSelectedContacts((prev) => {
 const next = new Set(prev);
 if (next.has(idx)) next.delete(idx);
 else next.add(idx);
 return next;
 });
 }}
 className="mt-1 accent-indigo-500"
 />
 <div className="flex-grow min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-bold text-[var(--foreground)]">{c.name}</span>
 <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${roleTypeColor(c.role_type)}`}>
 {roleTypeLabel(c.role_type)}
 </span>
 <span className="text-xs text-[var(--muted-foreground)]">
 {Math.round(c.confidence * 100)}% confidence
 </span>
 </div>
 <p className="text-sm text-[var(--muted-foreground)] mt-0.5">{c.current_title}</p>
 <p className="text-xs text-[var(--muted-foreground)] mt-1">{c.reason}</p>
 {c.profile_url && (
 <a
 href={c.profile_url.startsWith("http") ? c.profile_url : `https://${c.profile_url}`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1 text-xs text-[var(--primary)] mt-1.5 hover:text-blue-300"
 onClick={(e) => e.stopPropagation()}
 >
 <ExternalLink className="w-3 h-3" /> LinkedIn
 </a>
 )}
 </div>
 </label>
 ))}
 </div>

 <div className="flex gap-3 mt-6">
 <button
 onClick={() => handleFindContacts(true)}
 disabled={phaseStatus === "loading"}
 className="w-1/3 py-4 bg-[#2a2a30] hover:bg-[#3a3a40] text-[var(--foreground)] font-bold rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-3"
 >
 {phaseStatus === "loading" && loadingAction === "cycle" ? (
 <Loader2 className="w-5 h-5 animate-spin" />
 ) : (
 <Search className="w-5 h-5" />
 )}
 Cycle / Find More
 </button>

 <button
 onClick={handleFindEmails}
 disabled={phaseStatus === "loading" || selectedContacts.size === 0}
 className="w-2/3 py-4 bg-emerald-600 hover:bg-emerald-500 text-[var(--foreground)] font-bold rounded-xl transition-all -600/20 disabled:opacity-40 flex items-center justify-center gap-3"
 >
 {phaseStatus === "loading" && loadingAction === "emails" ? (
 <Loader2 className="w-5 h-5 animate-spin" />
 ) : (
 <Mail className="w-5 h-5" />
 )}
 {phaseStatus === "loading" && loadingAction === "emails"
 ? "Finding Emails..."
 : `Find Emails for ${selectedContacts.size} Contact${selectedContacts.size !== 1 ? "s" : ""}`}
 </button>
 </div>
 </div>
 </div>
 )}

 {/* ═══════ STEP 3: EMAILS DISCOVERED ═══════ */}
 {step === 3 && (
 <div className="space-y-6">
 <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <Mail className="w-5 h-5 text-[var(--primary)]" />
 <div>
 <h2 className="text-lg font-bold text-[var(--foreground)]">Emails Discovered</h2>
 <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
 Select the best email for each person
 </p>
 </div>
 </div>
 <button
 onClick={() => setStep(2)}
 className="text-xs text-[var(--primary)] border border-[var(--primary)]/20 px-3 py-1.5 rounded-lg hover:bg-[var(--primary)]/10"
 >
 ← Back
 </button>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {emailResults.map((person, pIdx) => (
 <div
 key={pIdx}
 className="bg-[var(--background)] rounded-xl border border-[var(--border)] p-5"
 >
 <div className="mb-3">
 <h3 className="font-bold text-[var(--foreground)]">{person.name}</h3>
 <p className="text-xs text-[var(--muted-foreground)]">{person.company} · {person.domain}</p>
 </div>

 {person.emails.length === 0 ? (
 <p className="text-xs text-[var(--muted-foreground)] italic">No emails found</p>
 ) : (
 <div className="space-y-2">
 {person.emails.map((em, eIdx) => {
 const isSelectedPrimary = selectedEmails.get(person.name)?.split("|")[0] === em.email;
 const isSelectedBcc = selectedEmails.get(person.name)?.split("|").slice(1).includes(em.email);
 
 return (
 <label
 key={eIdx}
 className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
 isSelectedPrimary || isSelectedBcc
 ? "bg-[var(--primary)]/10 border-[var(--primary)]/30"
 : "border-[var(--border)] hover:border-[var(--border)]"
 }`}
 >
 <input
 type="radio"
 name={`email-${person.name}`}
 checked={isSelectedPrimary}
 onChange={() => {
 // If they manually click, we just set this one as the sole primary (no BCCs for manual clicks)
 setSelectedEmails((prev) => new Map(prev).set(person.name, em.email));
 }}
 className="accent-blue-500"
 />
 <div className="flex-grow min-w-0">
 <span className="text-sm font-medium text-[var(--foreground)] truncate block">
 {em.email}
 </span>
 <div className="flex items-center gap-2 mt-1">
 {isSelectedBcc && (
 <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
 BCC FALLBACK
 </span>
 )}
 <span
 className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
 em.type === "verified"
 ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
 : em.type === "discovered"
 ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
 : "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
 }`}
 >
 {em.type}
 </span>
 <span className="text-[9px] text-[var(--muted-foreground)]">
 {em.source} · {Math.round(em.confidence * 100)}%
 </span>
 </div>
 </div>
 </label>
 );
 })}
 </div>
 )}
 </div>
 ))}
 </div>

 <button
 onClick={handleGenerateEmails}
 disabled={phaseStatus === "loading" || selectedEmails.size === 0}
 className="w-full mt-6 py-4 bg-[var(--primary)] hover:bg-blue-500 text-[var(--foreground)] font-bold rounded-xl transition-all -600/20 disabled:opacity-40 flex items-center justify-center gap-3"
 >
 {phaseStatus === "loading" && loadingAction === "drafts" ? (
 <Loader2 className="w-5 h-5 animate-spin" />
 ) : (
 <Sparkles className="w-5 h-5" />
 )}
 {phaseStatus === "loading" && loadingAction === "drafts"
 ? "Generating Master Template..."
 : "Generate Master Template"}
 </button>
 </div>
 </div>
 )}

 {/* ═══════ STEP 4: REVIEW TEMPLATE ═══════ */}
 {step === 4 && masterDrafts.length > 0 && (
 <div className="bg-[var(--card)] rounded-2xl p-6 border border-[var(--border)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="flex items-center gap-3 pb-4 border-b border-[var(--border)]">
 <div className="p-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg">
 <FileText className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-[var(--foreground)]">Review Email Template</h2>
 <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
 Edit if needed. <code className="text-[var(--primary)] font-mono text-[10px]">{"{{contactName}}"}</code> will be replaced with each person's first name when you approve.
 </p>
 </div>
 </div>

 <div className="space-y-4 bg-[#060608] p-5 rounded-xl border border-[var(--border)]">
 <div>
 <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">Subject</label>
 <input
 type="text"
 value={masterDrafts[0].subject}
 onChange={(e) => {
 const updated = [...masterDrafts];
 updated[0].subject = e.target.value;
 setMasterDrafts(updated);
 }}
 className="w-full bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
 />
 </div>
 <div>
 <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">Email Body</label>
 <textarea
 value={masterDrafts[0].rawText !== undefined ? masterDrafts[0].rawText : masterDrafts[0].htmlBody}
 onChange={(e) => {
 const updated = [...masterDrafts];
 if (updated[0].rawText !== undefined) {
 updated[0].rawText = e.target.value;
 } else {
 updated[0].htmlBody = e.target.value;
 }
 setMasterDrafts(updated);
 }}
 rows={18}
 className="w-full bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors leading-relaxed"
 />
 </div>
 </div>
 
 <div className="flex justify-end pt-4 border-t border-[var(--border)]">
 <button
 onClick={handleApproveMasterDraft}
 className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-[var(--foreground)] rounded-xl font-bold uppercase text-[11px] tracking-widest hover:bg-emerald-500 transition-colors"
 >
 <CheckCircle className="w-4 h-4" />
 Approve & Generate {Array.from(selectedEmails.entries()).filter(([_, e]) => e).length} Drafts
 </button>
 </div>
 </div>
 )}

 {/* ═══════ STEP 5: REVIEW & SEND ═══════ */}
 {step === 5 && (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Send className="w-5 h-5 text-amber-400" />
 <div>
 <h2 className="text-lg font-bold text-[var(--foreground)]">Review & Send</h2>
 <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
 Edit, then send directly or open as Gmail draft
 </p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <button
 onClick={() => setStep(4)}
 className="text-xs text-[var(--primary)] border border-[var(--primary)]/20 px-3 py-1.5 rounded-lg hover:bg-[var(--primary)]/10"
 >
 ← Back
 </button>
 {!isGmailConnected ? (
 <button
 onClick={() => { window.location.href = "/api/auth/google/login?redirect=/outreach"; }}
 className="text-xs text-[var(--foreground)] bg-[var(--primary)] px-3 py-1.5 rounded-lg hover:bg-blue-500 flex items-center gap-2"
 >
 <Mail className="w-3 h-3" /> Connect Gmail
 </button>
 ) : (
 <span className="text-xs text-[var(--primary)] bg-[var(--primary)]/10 px-3 py-1.5 rounded-lg border border-[var(--primary)]/20 flex items-center gap-1.5">
 <CheckCircle className="w-3 h-3" /> Gmail Connected
 </span>
 )}
 </div>
 </div>

 {drafts.map((draft, idx) => {
 const status = sendStatus.get(draft.toEmail) || "idle";
 const isEditing = editingDraftIdx === idx;

 return (
 <div
 key={idx}
 className={`bg-[var(--card)] rounded-xl border overflow-hidden ${
 status === "sent"
 ? "border-emerald-500/30"
 : "border-[var(--border)]"
 }`}
 >
 {/* Draft Header */}
 <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2">
 <UserCheck className="w-4 h-4 text-[var(--muted-foreground)]" />
 <span className="font-bold text-[var(--foreground)]">{draft.toName}</span>
 <span className="text-xs text-[var(--muted-foreground)]">· {draft.toEmail}</span>
 </div>
 </div>
 <div className="flex items-center gap-2">
 {status === "sent" && (
 <span className="text-xs font-bold text-[var(--primary)] px-2 py-1 bg-[var(--primary)]/10 rounded-full">
 ✓ Sent
 </span>
 )}
 {status === "error" && (
 <span className="text-xs font-bold text-red-400 px-2 py-1 bg-red-500/10 rounded-full">
 ✕ Failed
 </span>
 )}
 </div>
 </div>

 {/* Subject */}
 <div className="px-6 py-3 border-b border-[var(--border)] bg-[#0d0d0f]">
 {isEditing ? (
 <input
 type="text"
 value={editSubject}
 onChange={(e) => setEditSubject(e.target.value)}
 className="w-full bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--primary)]/40"
 />
 ) : (
 <p className="text-sm text-[var(--foreground)]">
 <span className="text-[var(--muted-foreground)]">Subject: </span>
 {draft.subject}
 </p>
 )}
 </div>

 {/* Body */}
 <div className="px-6 py-5">
 {isEditing ? (
 <textarea
 value={editBody}
 onChange={(e) => setEditBody(e.target.value)}
 rows={16}
 className="w-full bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--primary)]/40 resize-y font-mono"
 />
 ) : (
 <div
 className="text-sm text-[var(--foreground)] leading-relaxed prose prose-invert prose-sm max-w-none"
 dangerouslySetInnerHTML={{ __html: draft.htmlBody }}
 />
 )}
 </div>

 {/* Actions */}
 <div className="px-6 py-4 border-t border-[var(--border)] bg-[#0d0d0f] flex flex-wrap gap-3">
 {isEditing ? (
 <>
 <button
 onClick={() => handleSaveEdit(idx)}
 className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] hover:bg-indigo-500 text-[var(--foreground)] text-sm font-bold rounded-lg transition-all"
 >
 <CheckCircle className="w-4 h-4" /> Save Changes
 </button>
 <button
 onClick={() => setEditingDraftIdx(null)}
 className="flex items-center gap-2 px-4 py-2.5 bg-[var(--secondary)] hover:bg-[#2a2a30] text-[var(--foreground)] text-sm rounded-lg border border-[var(--border)]"
 >
 Cancel
 </button>
 </>
 ) : (
 <>
 {/* Edit */}
 <button
 onClick={() => {
 setEditingDraftIdx(idx);
 setEditSubject(draft.subject);
 setEditBody(draft.htmlBody);
 }}
 disabled={status === "sent"}
 className="flex items-center gap-2 px-4 py-2.5 bg-[var(--secondary)] hover:bg-[#2a2a30] text-[var(--foreground)] text-sm rounded-lg border border-[var(--border)] transition-all disabled:opacity-40"
 >
 <Edit3 className="w-4 h-4" /> Edit
 </button>

 {/* Open in Gmail Draft */}
 {isGmailConnected ? (
 <button
 onClick={() => handleCreateApiDraft(draft)}
 disabled={status === "sending" || status === "sent"}
 className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 text-[var(--primary)] text-sm rounded-lg border border-[var(--primary)]/30 transition-all disabled:opacity-40"
 >
 {status === "sending" ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : status === "sent" ? (
 <CheckCircle className="w-4 h-4 text-[var(--primary)]" />
 ) : (
 <Mail className="w-4 h-4" />
 )}
 {status === "sending" ? "Drafting..." : status === "sent" ? "Draft Created" : "Create API Draft"}
 </button>
 ) : (
 <button
 onClick={() => handleOpenInGmail(draft)}
 className="flex items-center gap-2 px-4 py-2.5 bg-[var(--secondary)] hover:bg-[#2a2a30] text-[var(--foreground)] text-sm rounded-lg border border-[var(--border)] transition-all"
 >
 {copied === draft.toEmail + "_gmail" ? (
 <CheckCircle className="w-4 h-4 text-[var(--primary)]" />
 ) : (
 <ExternalLink className="w-4 h-4" />
 )}
 {copied === draft.toEmail + "_gmail" ? "Copied! Paste in Gmail" : "Open in Gmail"}
 </button>
 )}

 {/* Copy */}
 <button
 onClick={() => handleCopyHtml(draft, draft.toEmail)}
 className="flex items-center gap-2 px-4 py-2.5 bg-[var(--secondary)] hover:bg-[#2a2a30] text-[var(--foreground)] text-sm rounded-lg border border-[var(--border)] transition-all"
 >
 {copied === draft.toEmail ? (
 <CheckCircle className="w-4 h-4 text-[var(--primary)]" />
 ) : (
 <Copy className="w-4 h-4" />
 )}
 {copied === draft.toEmail ? "Copied!" : "Copy Text"}
 </button>

 {/* Send via SMTP */}
 <button
 onClick={() => handleSendEmail(draft)}
 disabled={status === "sending" || status === "sent"}
 className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-[var(--foreground)] text-sm font-bold rounded-lg transition-all -600/20 disabled:opacity-40 ml-auto"
 >
 {status === "sending" ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : status === "sent" ? (
 <CheckCircle className="w-4 h-4" />
 ) : (
 <Send className="w-4 h-4" />
 )}
 {status === "sending"
 ? "Sending..."
 : status === "sent"
 ? "Sent ✓"
 : "Send Email"}
 </button>
 </>
 )}
 </div>
 </div>
 );
 })}

 {/* Track in Job Tracker CTA */}
 <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Briefcase className="w-5 h-5 text-amber-400" />
 <div>
 <h3 className="font-bold text-[var(--foreground)] text-sm">Track this application</h3>
 <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
 Add {company} — {jobTitle} to your Job Tracker
 </p>
 </div>
 </div>
 <a
 href={`/dashboard?addNew=true&company=${encodeURIComponent(company)}&role=${encodeURIComponent(jobTitle)}&status=applied&platform=cold-email`}
 target="_blank"
 rel="noopener noreferrer"
 className="flex items-center gap-2 px-5 py-2.5 bg-amber-600/20 text-amber-300 text-sm font-bold rounded-lg border border-amber-500/30 hover:bg-amber-600/30 transition-all"
 >
 <Briefcase className="w-4 h-4" /> Open Tracker
 <ArrowRight className="w-3 h-3" />
 </a>
 </div>
 </div>
 )}

 {/* Footer */}
 <footer className="text-center text-xs text-slate-600 pt-6">
 Outreach Automation · Part of Job Outreach Suite
 </footer>
 </div>

 {isMounted && <UsageTracker localUsage={localUsage} hunterKey={apiKeys.hunter} apolloKey={apiKeys.apollo} />}
 </main>
 );
}
