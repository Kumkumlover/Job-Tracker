"use client";

import React, { useState, useEffect, type FormEvent } from "react";
import {
 Settings,
 UserPlus,
 Trash2,
 Search,
 Mail,
 AlertCircle,
 CheckCircle,
 ThumbsUp,
 ThumbsDown,
 Key,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface PersonRow {
 id: number;
 name: string;
 company: string;
 domain: string;
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

type Status = "idle" | "loading" | "success" | "error";

// ─── Component ──────────────────────────────────────────────────

export default function EmailFinderPage() {
 const [apiKeys, setApiKeys] = useState({ hunter: "", apollo: "" });
 const [tempKeys, setTempKeys] = useState({ hunter: "", apollo: "" });
 const [showKeys, setShowKeys] = useState(false);
 const [keyStatus, setKeyStatus] = useState({
 hunter: "idle" as "idle" | "checking" | "valid" | "invalid",
 apollo: "idle" as "idle" | "checking" | "valid" | "invalid",
 });
 const [keyError, setKeyError] = useState({ hunter: "", apollo: "" });

 // Load saved keys on mount
 useEffect(() => {
 fetch("/api/settings")
 .then((res) => res.json())
 .then((data) => {
 if (data.apiKeys) {
 const savedHunter = data.apiKeys.hunterKey || "";
 const savedApollo = data.apiKeys.apolloKey || "";
 setApiKeys({ hunter: savedHunter, apollo: savedApollo });
 setTempKeys({ hunter: savedHunter, apollo: savedApollo });
 if (savedHunter) setKeyStatus((prev) => ({ ...prev, hunter: "valid" }));
 if (savedApollo) setKeyStatus((prev) => ({ ...prev, apollo: "valid" }));
 }
 })
 .catch((err) => console.error("Failed to load settings:", err));
 }, []);

 const handleTempKeyChange = (provider: "hunter" | "apollo", val: string) => {
 setTempKeys((prev) => ({ ...prev, [provider]: val }));
 setKeyStatus((prev) => ({ ...prev, [provider]: "idle" }));
 setKeyError((prev) => ({ ...prev, [provider]: "" }));
 };

 const verifyKey = async (provider: "hunter" | "apollo") => {
 const key = tempKeys[provider].trim();
 if (!key) {
 setApiKeys((prev) => ({ ...prev, [provider]: "" }));
 fetch("/api/settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ [`${provider}Key`]: "" })
 }).catch(console.error);
 setKeyStatus((prev) => ({ ...prev, [provider]: "idle" }));
 return;
 }

 setKeyStatus((prev) => ({ ...prev, [provider]: "checking" }));
 setKeyError((prev) => ({ ...prev, [provider]: "" }));

 try {
 const res = await fetch("/api/verify-keys", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ [`${provider}Key`]: key }),
 });
 const data = await res.json();

 const providerData = data[provider];
 if (providerData && providerData.valid) {
 setKeyStatus((prev) => ({ ...prev, [provider]: "valid" }));
 setApiKeys((prev) => ({ ...prev, [provider]: key }));
 
 // Save to DB
 await fetch("/api/settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ [`${provider}Key`]: key })
 });
 } else {
 setKeyStatus((prev) => ({ ...prev, [provider]: "invalid" }));
 setKeyError((prev) => ({ ...prev, [provider]: "Invalid API key" }));
 }
 } catch (err: any) {
 setKeyStatus((prev) => ({ ...prev, [provider]: "invalid" }));
 setKeyError((prev) => ({ ...prev, [provider]: "Failed to verify key" }));
 }
 };
 const [people, setPeople] = useState<PersonRow[]>([
 { id: Date.now(), name: "", company: "", domain: "" },
 ]);
 const [results, setResults] = useState<PersonResult[] | null>(null);
 const [status, setStatus] = useState<Status>("idle");
 const [error, setError] = useState("");

 useEffect(() => {
 const savedPeople = localStorage.getItem("finder_people");
 if (savedPeople) setPeople(JSON.parse(savedPeople));

 const savedResults = localStorage.getItem("finder_results");
 if (savedResults) setResults(JSON.parse(savedResults));

 const savedStatus = localStorage.getItem("finder_status");
 if (savedStatus) setStatus(savedStatus as Status);
 }, []);

 useEffect(() => {
 localStorage.setItem("finder_people", JSON.stringify(people));
 localStorage.setItem("finder_results", JSON.stringify(results));
 localStorage.setItem("finder_status", status);
 }, [people, results, status]);
 const [feedbackGiven, setFeedbackGiven] = useState<
 Record<string, "correct" | "incorrect">
 >({});

 // ── Handlers ──

 const handleAddRow = () => {
 setPeople([
 ...people,
 { id: Date.now(), name: "", company: "", domain: "" },
 ]);
 };

 const handleRemoveRow = (id: number) => {
 setPeople(people.filter((p) => p.id !== id));
 };

 const handleInputChange = (id: number, field: keyof PersonRow, value: string) => {
 setPeople(people.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
 };

 const handleEnrich = async (e: FormEvent) => {
 e.preventDefault();
 setStatus("loading");
 setError("");
 setResults(null);

 const payload = people
 .filter((p) => p.name && p.company)
 .map((p) => ({ name: p.name, company: p.company, domain: p.domain }));

 if (payload.length === 0) {
 setError("Please fill in Name and Company for at least one person.");
 setStatus("error");
 return;
 }

 try {
 const res = await fetch("/api/enrich-emails", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 "X-Hunter-Key": apiKeys.hunter,
 "X-Apollo-Key": apiKeys.apollo,
 },
 body: JSON.stringify(payload),
 });

 if (!res.ok) {
 if (res.status === 504) {
 throw new Error("The request timed out (504). Please try processing fewer contacts at once, or wait a moment and try again.");
 }
 const errData = await res.json().catch(() => ({}));
 throw new Error(errData.error ?? `Server error: ${res.status}`);
 }

 const data: PersonResult[] = await res.json();
 setResults(data);
 setStatus("success");
 } catch (err) {
 setError((err as Error).message);
 setStatus("error");
 }
 };

 const handleFeedback = async (
 email: string,
 feedbackStatus: "correct" | "incorrect"
 ) => {
 try {
 const res = await fetch("/api/submit-feedback", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email, status: feedbackStatus }),
 });

 if (res.ok) {
 setFeedbackGiven((prev) => ({ ...prev, [email]: feedbackStatus }));
 }
 } catch (err) {
 console.error("Failed to submit feedback", err);
 }
 };

 // ── Render ──

 return (
 <main className="min-h-screen bg-[var(--background)] text-slate-200 font-sans">
 {/* Gradient background effect */}
 <div className="fixed inset-0 pointer-events-none">
 <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[var(--primary)]/5 rounded-full blur-[120px]" />
 <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-purple-600/5 rounded-full blur-[100px]" />
 </div>

 <div className="relative z-10 w-full max-w-[98%] mx-auto px-6 py-12 space-y-8">
 {/* Header */}
 <header className="space-y-2">
 <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
 <div className="p-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl">
 <Search className="w-7 h-7 text-[var(--primary)]" />
 </div>
 Email Intelligence Engine
 </h1>
 <p className="text-[var(--muted-foreground)] text-lg">
 Discover, verify, and predict professional email addresses.
 </p>
 </header>

 {/* API Keys Panel */}
 <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
 <button
 type="button"
 onClick={() => setShowKeys(!showKeys)}
 className="w-full px-6 py-4 flex items-center justify-between hover:bg-[var(--card-hover)] transition-colors"
 >
 <div className="flex items-center gap-2">
 <Settings className="w-5 h-5 text-[var(--muted-foreground)]" />
 <span className="font-semibold text-[var(--foreground)]">
 API Keys Configuration
 </span>
 </div>
 <span className="text-xs text-[var(--muted-foreground)]">
 {showKeys ? "Hide" : "Show"}
 </span>
 </button>

 {showKeys && (
 <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-[var(--border)] pt-6">
 <div className="space-y-2">
 <label className="text-sm font-medium text-[var(--muted-foreground)] flex items-center justify-between">
 <span className="flex items-center gap-2">
 <Key className="w-4 h-4 text-orange-400" /> Hunter.io API Key
 </span>
 {keyStatus.hunter === "valid" && (
 <span className="text-xs text-green-400 flex items-center gap-1">
 <CheckCircle className="w-3 h-3" /> Saved & Active
 </span>
 )}
 {keyStatus.hunter === "invalid" && (
 <span className="text-xs text-red-400 flex items-center gap-1">
 <AlertCircle className="w-3 h-3" /> {keyError.hunter || "Invalid"}
 </span>
 )}
 </label>
 <div className="flex gap-2">
 <input
 type="password"
 placeholder="Enter Hunter API key..."
 value={tempKeys.hunter}
 onChange={(e) => handleTempKeyChange("hunter", e.target.value)}
 className={`flex-1 px-4 py-2.5 bg-[var(--background)] border ${keyStatus.hunter === 'invalid' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : keyStatus.hunter === 'valid' ? 'border-green-500/50' : 'border-[var(--border)] focus:border-[var(--primary)]/40 focus:ring-[var(--primary)]/40'} rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 outline-none transition-all`}
 />
 <button
 type="button"
 onClick={() => verifyKey("hunter")}
 disabled={keyStatus.hunter === "checking" || tempKeys.hunter === apiKeys.hunter}
 className="px-4 py-2 bg-[var(--secondary)] hover:bg-[#2a2a30] disabled:opacity-50 text-[var(--foreground)] rounded-lg transition-colors border border-[var(--border)]"
 >
 {keyStatus.hunter === "checking" ? "Verifying..." : "Verify & Save"}
 </button>
 </div>
 </div>
 <div className="space-y-2">
 <label className="text-sm font-medium text-[var(--muted-foreground)] flex items-center justify-between">
 <span className="flex items-center gap-2">
 <Key className="w-4 h-4 text-[var(--primary)]" /> Apollo.io API Key
 </span>
 {keyStatus.apollo === "valid" && (
 <span className="text-xs text-green-400 flex items-center gap-1">
 <CheckCircle className="w-3 h-3" /> Saved & Active
 </span>
 )}
 {keyStatus.apollo === "invalid" && (
 <span className="text-xs text-red-400 flex items-center gap-1">
 <AlertCircle className="w-3 h-3" /> {keyError.apollo || "Invalid"}
 </span>
 )}
 </label>
 <div className="flex gap-2">
 <input
 type="password"
 placeholder="Enter Apollo API key..."
 value={tempKeys.apollo}
 onChange={(e) => handleTempKeyChange("apollo", e.target.value)}
 className={`flex-1 px-4 py-2.5 bg-[var(--background)] border ${keyStatus.apollo === 'invalid' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : keyStatus.apollo === 'valid' ? 'border-green-500/50' : 'border-[var(--border)] focus:border-[var(--primary)]/40 focus:ring-[var(--primary)]/40'} rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 outline-none transition-all`}
 />
 <button
 type="button"
 onClick={() => verifyKey("apollo")}
 disabled={keyStatus.apollo === "checking" || tempKeys.apollo === apiKeys.apollo}
 className="px-4 py-2 bg-[var(--secondary)] hover:bg-[#2a2a30] disabled:opacity-50 text-[var(--foreground)] rounded-lg transition-colors border border-[var(--border)]"
 >
 {keyStatus.apollo === "checking" ? "Verifying..." : "Verify & Save"}
 </button>
 </div>
 </div>
 <p className="col-span-full text-xs text-slate-600">
 Keys are sent via headers and never stored. Without keys, only
 permutation-based prediction is used.
 </p>
 </div>
 )}
 </div>

 {/* Input Panel */}
 <form
 onSubmit={handleEnrich}
 className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden"
 >
 <div className="px-6 py-4 border-b border-[var(--border)]">
 <h2 className="font-semibold text-[var(--foreground)]">Target Contacts</h2>
 </div>
 <div className="p-6 space-y-4">
 {/* Table Header */}
 <div className="hidden md:grid grid-cols-12 gap-4 text-sm font-medium text-[var(--muted-foreground)] px-1">
 <div className="col-span-4">Full Name</div>
 <div className="col-span-3">Company Name</div>
 <div className="col-span-4">Domain</div>
 <div className="col-span-1 text-center">Action</div>
 </div>

 {/* Dynamic Rows */}
 {people.map((person) => (
 <div
 key={person.id}
 className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
 >
 <div className="col-span-4">
 <input
 type="text"
 placeholder="e.g. Jane Doe"
 value={person.name}
 onChange={(e) =>
 handleInputChange(person.id, "name", e.target.value)
 }
 className="w-full px-4 py-2.5 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/40 outline-none transition-all"
 />
 </div>
 <div className="col-span-3">
 <input
 type="text"
 placeholder="e.g. Acme Corp"
 value={person.company}
 onChange={(e) =>
 handleInputChange(person.id, "company", e.target.value)
 }
 className="w-full px-4 py-2.5 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/40 outline-none transition-all"
 />
 </div>
 <div className="col-span-4">
 <input
 type="text"
 placeholder="e.g. acme.com"
 value={person.domain}
 onChange={(e) =>
 handleInputChange(person.id, "domain", e.target.value)
 }
 className="w-full px-4 py-2.5 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/40 outline-none transition-all"
 />
 </div>
 <div className="col-span-1 flex justify-center">
 <button
 type="button"
 onClick={() => handleRemoveRow(person.id)}
 disabled={people.length === 1}
 className="p-2 text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30"
 >
 <Trash2 className="w-5 h-5" />
 </button>
 </div>
 </div>
 ))}

 <div className="pt-4 flex justify-between items-center border-t border-[var(--border)]">
 <button
 type="button"
 onClick={handleAddRow}
 className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
 >
 <UserPlus className="w-4 h-4" /> Add Person
 </button>

 <button
 type="submit"
 disabled={status === "loading"}
 className="flex items-center gap-2 px-6 py-2.5 bg-[var(--primary)] hover:bg-blue-500 text-[var(--foreground)] font-medium rounded-lg transition-colors -600/20 disabled:opacity-50"
 >
 {status === "loading" ? (
 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 ) : (
 <Search className="w-5 h-5" />
 )}
 {status === "loading" ? "Enriching..." : "Find Emails"}
 </button>
 </div>
 </div>
 </form>

 {/* Error State */}
 {error && (
 <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-6 py-4 rounded-xl flex items-center gap-3">
 <AlertCircle className="w-5 h-5 flex-shrink-0" />
 <p>{error}</p>
 </div>
 )}

 {/* Results Panel */}
 {results && results.length > 0 && (
 <div className="space-y-6">
 <h2 className="text-xl font-bold text-[var(--foreground)]">
 Intelligence Results
 </h2>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
 {results.map((personResult, idx) => (
 <div
 key={idx}
 className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden"
 >
 {/* Card Header */}
 <div className="p-5 border-b border-[var(--border)]">
 <h3 className="text-lg font-bold text-[var(--foreground)]">
 {personResult.name}
 </h3>
 <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
 {personResult.company} · {personResult.domain}
 </p>
 {personResult.recommended ? (
 <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--primary)]/10 text-emerald-300 text-sm font-medium rounded-full border border-[var(--primary)]/20">
 <CheckCircle className="w-4 h-4" />
 Best: {personResult.recommended}
 </div>
 ) : (
 <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-300 text-sm font-medium rounded-full border border-amber-500/20">
 <AlertCircle className="w-4 h-4" />
 No confident match
 </div>
 )}
 </div>

 {/* Emails List */}
 <div className="p-5 space-y-3">
 {personResult.emails.length === 0 ? (
 <p className="text-[var(--muted-foreground)] text-sm italic">
 No emails discovered or predicted.
 </p>
 ) : (
 personResult.emails.map((emailData, eIdx) => (
 <div
 key={eIdx}
 className="group relative border border-[var(--border)] rounded-lg p-3 hover:border-[var(--primary)]/30 hover:bg-[#0d0d0f] transition-all"
 >
 <div className="flex justify-between items-start">
 <div>
 <div className="flex items-center gap-2">
 <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
 <span className="font-medium text-[var(--foreground)] text-sm">
 {emailData.email}
 </span>
 </div>
 <div className="flex gap-2 mt-1.5 items-center">
 <span
 className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
 emailData.type === "verified"
 ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
 : emailData.type === "discovered"
 ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
 : "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
 }`}
 >
 {emailData.type}
 </span>
 <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--border)]">
 {emailData.source}
 </span>
 <span className="text-xs text-[var(--muted-foreground)]">
 {Math.round(emailData.confidence * 100)}%
 confidence
 </span>
 </div>
 </div>

 {/* Feedback Actions */}
 <div className="flex items-center gap-1 transition-opacity">
 {feedbackGiven[emailData.email] === "correct" ? (
 <span className="text-xs font-medium text-green-400 px-2 py-1 bg-green-500/10 rounded">
 ✓ Verified
 </span>
 ) : feedbackGiven[emailData.email] ===
 "incorrect" ? (
 <span className="text-xs font-medium text-red-400 px-2 py-1 bg-red-500/10 rounded">
 ✗ Rejected
 </span>
 ) : (
 <>
 <button
 onClick={() =>
 handleFeedback(
 emailData.email,
 "correct"
 )
 }
 title="Mark as correct"
 className="p-1.5 text-[var(--muted-foreground)] hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
 >
 <ThumbsUp className="w-4 h-4" />
 </button>
 <button
 onClick={() =>
 handleFeedback(
 emailData.email,
 "incorrect"
 )
 }
 title="Mark as incorrect"
 className="p-1.5 text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
 >
 <ThumbsDown className="w-4 h-4" />
 </button>
 </>
 )}
 </div>
 </div>

 {/* Confidence Bar */}
 <div className="mt-3 h-1 w-full bg-[var(--secondary)] rounded-full overflow-hidden">
 <div
 className={`h-full rounded-full transition-all ${
 emailData.confidence > 0.8
 ? "bg-emerald-500"
 : emailData.confidence > 0.5
 ? "bg-yellow-500"
 : "bg-red-500"
 }`}
 style={{
 width: `${emailData.confidence * 100}%`,
 }}
 />
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Footer */}
 <footer className="text-center text-xs text-slate-600 pt-8">
 Email Intelligence Engine · Part of Job Outreach Suite
 </footer>
 </div>
 </main>
 );
}
