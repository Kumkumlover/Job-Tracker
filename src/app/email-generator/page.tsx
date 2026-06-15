"use client";
import React, { useState, useEffect, useRef } from "react";
import { Copy, Briefcase, CheckCircle, Database, Sparkles, Loader2, Search, Globe, Trash2, FileText, Link, X, Lightbulb, UserPlus, Layers, Upload } from "lucide-react";
import type { VaultItem, ResearchProblem, OutputType } from "@/lib/email-generator/types";
import { generateCopy } from "@/lib/email-generator/templates";

type Step = 1 | 2 | 3;

export default function EmailGeneratorPage() {
 const [contactName, setContactName] = useState("");
 const [companyName, setCompanyName] = useState("");
 const [industry, setIndustry] = useState("Fintech / Payments");
 const [role, setRole] = useState("Product Manager");
 const [leadUrl, setLeadUrl] = useState("");
 const [companyWebsite, setCompanyWebsite] = useState("");
 const [jobDescription, setJobDescription] = useState("");
 const [geminiKey, setGeminiKey] = useState("");

 useEffect(() => {
 fetch("/api/settings")
 .then((res) => res.json())
 .then((data) => {
 if (data.apiKeys?.geminiKey) {
 setGeminiKey(data.apiKeys.geminiKey);
 }
 })
 .catch((err) => console.error("Failed to load settings:", err));
 }, []);

 const handleGeminiKeyBlur = () => {
 fetch("/api/settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ geminiKey })
 }).catch(console.error);
 };
 const [selectedProblem, setSelectedProblem] = useState<ResearchProblem | null>(null);
 const [outputType, setOutputType] = useState<OutputType>("Cold Email");
 const [step, setStep] = useState<Step>(1);
 const [isResearching, setIsResearching] = useState(false);
 const [researchStatus, setResearchStatus] = useState("");
 const [dynamicProblems, setDynamicProblems] = useState<ResearchProblem[]>([]);
 const [error, setError] = useState("");
 const [copied, setCopied] = useState(false);

 const [vault, setVault] = useState<VaultItem[]>([]);
 const [vaultType, setVaultType] = useState<"evidence" | "inspiration">("evidence");
 const [isAddingContext, setIsAddingContext] = useState<"text" | "link" | "file" | null>(null);
 const [newTitle, setNewTitle] = useState("");
 const [newContent, setNewContent] = useState("");
 const [selectedFile, setSelectedFile] = useState<{ base64: string, mimeType: string, name: string } | null>(null);
 const [isDigesting, setIsDigesting] = useState(false);

 const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = (ev) => {
 const result = ev.target?.result as string;
 const base64 = result.split(',')[1];
 setSelectedFile({ base64, mimeType: file.type || "application/octet-stream", name: file.name });
 };
 reader.readAsDataURL(file);
 };

 useEffect(() => { fetchVault(); }, []);

 const fetchVault = async () => {
 try {
 const res = await fetch("/api/email-generator/vault");
 if (res.ok) { const data = await res.json(); setVault(data.items || []); }
 } catch { /* ignore */ }
 };

 const addVaultItem = async () => {
 setIsDigesting(true); setError("");
 try {
 const body: Record<string, string> = { title: newTitle || "Untitled", vaultType };
 if (isAddingContext === "link") { body.url = newTitle; body.geminiApiKey = geminiKey; }
 else if (isAddingContext === "file") {
 if (!selectedFile) throw new Error("Please select a file.");
 body.title = newTitle || selectedFile.name;
 body.base64Data = selectedFile.base64;
 body.mimeType = selectedFile.mimeType;
 body.geminiApiKey = geminiKey;
 }
 else { body.content = newContent; body.type = "text"; }
 const res = await fetch("/api/email-generator/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
 if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
 setNewTitle(""); setNewContent(""); setIsAddingContext(null); setSelectedFile(null); await fetchVault();
 } catch (err) { setError((err as Error).message); }
 finally { setIsDigesting(false); }
 };

 const removeVaultItem = async (id: string) => {
 await fetch("/api/email-generator/vault", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
 await fetchVault();
 };

 const executeResearch = async () => {
 if (!companyName) return;
 setIsResearching(true); setError(""); setResearchStatus("Executing RAG pipeline...");
 try {
 const res = await fetch("/api/email-generator/research", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ companyName, industry, role, contactName, leadUrl, companyWebsite, jobDescription, geminiApiKey: geminiKey }),
 });
 if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
 const data = await res.json();
 setDynamicProblems(data.problems || []); setStep(2);
 } catch (err) { setError((err as Error).message); setStep(1); }
 finally { setIsResearching(false); }
 };

 const handleCopy = (text: string) => {
 navigator.clipboard.writeText(text);
 setCopied(true); setTimeout(() => setCopied(false), 2000);
 };

 const filteredVault = vault.filter(i => i.vaultType === vaultType);
 const industries = ["Fintech / Payments", "Q-Commerce", "B2B AI SaaS / Ops", "Custom"];

 return (
 <main className="min-h-screen bg-[var(--background)] text-slate-200 font-sans">
 <div className="fixed inset-0 pointer-events-none">
 <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-[var(--primary)]/5 rounded-full blur-[120px]" />
 <div className="absolute bottom-0 left-0 w-[500px] h-[300px] bg-purple-600/5 rounded-full blur-[100px]" />
 </div>

 <div className="relative z-10 max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-6 px-4 py-8 md:px-6">
 {/* Sidebar: Vault */}
 <aside className="lg:w-[360px] flex-shrink-0">
 <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5 sticky top-6 flex flex-col max-h-[calc(100vh-3rem)]">
 <div className="flex items-center justify-between mb-5">
 <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] flex items-center gap-2">
 <Layers className="w-4 h-4 text-[var(--primary)]" /> Evidence Library
 </h2>
 <span className="text-[9px] font-bold text-[var(--muted-foreground)] bg-[var(--secondary)] px-2 py-1 rounded-full">{vault.length} ITEMS</span>
 </div>

 <div className="flex gap-1 mb-4 bg-[var(--background)] p-1 rounded-lg border border-[var(--border)]">
 <button onClick={() => setVaultType("evidence")} className={`flex-1 py-2 text-[9px] font-bold uppercase rounded-md transition-all ${vaultType === "evidence" ? "bg-[var(--secondary)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}>My Evidence</button>
 <button onClick={() => setVaultType("inspiration")} className={`flex-1 py-2 text-[9px] font-bold uppercase rounded-md transition-all ${vaultType === "inspiration" ? "bg-[var(--secondary)] text-amber-400" : "text-[var(--muted-foreground)]"}`}>Inspiration</button>
 </div>

 <div className="flex gap-2 mb-4">
 <button onClick={() => setIsAddingContext("text")} className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] hover:border-[var(--primary)]/30 transition-all">
 <FileText className="w-4 h-4 text-[var(--primary)]" /><span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Text</span>
 </button>
 <button onClick={() => setIsAddingContext("link")} className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] hover:border-emerald-500/30 transition-all">
 <Link className="w-4 h-4 text-[var(--primary)]" /><span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">URL</span>
 </button>
 <button onClick={() => setIsAddingContext("file")} className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] hover:border-purple-500/30 transition-all">
 <Upload className="w-4 h-4 text-purple-400" /><span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">File</span>
 </button>
 </div>

 {isDigesting && (
 <div className="mb-3 p-3 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl flex items-center gap-2">
 <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin" />
 <span className="text-[10px] font-bold text-[var(--primary)] uppercase">Indexing...</span>
 </div>
 )}

 {isAddingContext && (
 <div className="mb-4 bg-[var(--background)] p-4 rounded-xl border border-[var(--primary)]/20 relative">
 <button onClick={() => setIsAddingContext(null)} className="absolute top-3 right-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><X className="w-4 h-4" /></button>
 <div className="space-y-3">
 {isAddingContext !== "file" && (
 <input type="text" placeholder={isAddingContext === "link" ? "Paste URL..." : "Title..."} value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
 className="w-full bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] outline-none" />
 )}
 {isAddingContext === "file" && (
 <>
 <input type="text" placeholder="Optional Custom Title..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
 className="w-full bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] outline-none" />
 <input type="file" onChange={handleFileSelect} className="w-full text-xs text-[var(--muted-foreground)] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-[var(--primary)]/20 file:text-[var(--primary)] hover:file:bg-[var(--primary)]/30 transition-all cursor-pointer" />
 </>
 )}
 {isAddingContext === "text" && (
 <textarea placeholder="Paste content..." rows={3} value={newContent} onChange={(e) => setNewContent(e.target.value)}
 className="w-full bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] outline-none" />
 )}
 <button onClick={addVaultItem} disabled={isDigesting || (isAddingContext === "file" && !selectedFile)} className="w-full bg-[var(--primary)] text-[var(--foreground)] py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-indigo-500 disabled:opacity-50">
 {isAddingContext === "link" ? "Ingest URL" : isAddingContext === "file" ? "Ingest File" : "Save"}
 </button>
 </div>
 </div>
 )}

 <div className="flex-grow overflow-y-auto space-y-2 pr-1 pb-4" style={{ maxHeight: "400px" }}>
 {filteredVault.map(item => (
 <div key={item.id} className="group p-4 bg-[var(--background)] rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/30 transition-all relative">
 <button onClick={() => removeVaultItem(item.id)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
 <div className="flex items-center gap-2 mb-1.5">
 {item.vaultType === "inspiration" ? <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> : <Briefcase className="w-3.5 h-3.5 text-[var(--primary)]" />}
 <span className="text-[9px] font-bold uppercase text-[var(--muted-foreground)] truncate">{item.title}</span>
 </div>
 <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed line-clamp-2">{item.content}</p>
 </div>
 ))}
 {filteredVault.length === 0 && !isAddingContext && (
 <div className="flex flex-col items-center justify-center py-10 opacity-30">
 {vaultType === "evidence" ? <Briefcase className="w-8 h-8 mb-2" /> : <Lightbulb className="w-8 h-8 mb-2" />}
 <p className="text-[9px] font-bold uppercase">No {vaultType} yet</p>
 </div>
 )}
 </div>

 {/* Gemini API Key */}
 <div className="mt-4 pt-4 border-t border-[var(--border)]">
 <label className="text-[9px] font-bold uppercase text-[var(--muted-foreground)] mb-1.5 block">Gemini API Key</label>
 <input type="password" placeholder="AIzaSy..." value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} onBlur={handleGeminiKeyBlur}
 className="w-full bg-[var(--background)] p-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] outline-none" />
 </div>
 </div>
 </aside>

 {/* Main Content */}
 <div className="flex-grow space-y-6">
 <header className="flex items-center gap-3 bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)]">
 <div className="p-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl">
 <Sparkles className="w-5 h-5 text-[var(--primary)]" />
 </div>
 <span className="text-lg font-bold text-[var(--foreground)] tracking-tight">RAG Orchestrator</span>
 </header>

 {error && (
 <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-5 py-3 rounded-xl flex items-center gap-3 text-sm">
 <X className="w-4 h-4 flex-shrink-0" />
 <p>{error}</p>
 <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-200"><X className="w-4 h-4" /></button>
 </div>
 )}

 <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 md:p-8 relative overflow-hidden min-h-[500px]">
 {/* Loading overlay */}
 {isResearching && (
 <div className="absolute inset-0 bg-[var(--card)] backdrop-blur-sm z-40 flex flex-col items-center justify-center">
 <Loader2 className="w-12 h-12 text-[var(--primary)] animate-spin mb-4" />
 <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-widest">{researchStatus}</h3>
 <p className="text-[var(--muted-foreground)] text-xs mt-1">Cross-referencing {vault.length} artifacts...</p>
 </div>
 )}

 {/* Step 1: Input Form */}
 {step === 1 && (
 <div className="grid lg:grid-cols-2 gap-8">
 <div className="space-y-5">
 <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Targeting Matrix</h3>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase">Industry</label>
 <select value={industry} onChange={(e) => setIndustry(e.target.value)}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none">
 {industries.map(i => <option key={i} value={i}>{i}</option>)}
 </select>
 </div>
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase">Target Company</label>
 <input type="text" placeholder="e.g. Slice" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none" />
 </div>
 </div>
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase">Target Role</label>
 <input type="text" placeholder="e.g. Associate Product Manager" value={role} onChange={(e) => setRole(e.target.value)}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none" />
 </div>
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase flex items-center gap-1"><Globe className="w-3 h-3" /> Company Website</label>
 <input type="text" placeholder="e.g. unibots.com" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none" />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase flex items-center gap-1"><UserPlus className="w-3 h-3" /> Hiring Lead</label>
 <input type="text" placeholder="e.g. Raj" value={contactName} onChange={(e) => setContactName(e.target.value)}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none" />
 </div>
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase flex items-center gap-1"><Search className="w-3 h-3" /> Lead LinkedIn</label>
 <input type="text" placeholder="linkedin.com/in/..." value={leadUrl} onChange={(e) => setLeadUrl(e.target.value)}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none" />
 </div>
 </div>
 <div>
 <label className="text-[9px] font-bold text-[var(--muted-foreground)] mb-1.5 block uppercase flex items-center gap-1"><FileText className="w-3 h-3" /> Job Description</label>
 <textarea placeholder="Paste the JD here..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={3}
 className="w-full p-3 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-xl text-sm text-[var(--foreground)] outline-none" />
 </div>
 </div>
 <div className="flex flex-col justify-end">
 <div className="bg-[var(--primary)]/5 p-5 rounded-2xl mb-5 border border-[var(--primary)]/10">
 <p className="text-xs text-[var(--primary)] leading-relaxed italic">
 &ldquo;I&apos;ll formulate bespoke hypotheses and draft personalized cold emails, follow-ups, and warm LinkedIn DMs by scraping their profile.&rdquo;
 </p>
 </div>
 <button onClick={executeResearch} disabled={!companyName || isResearching}
 className="w-full py-4 bg-[var(--primary)] text-[var(--foreground)] rounded-xl font-bold text-sm uppercase tracking-widest -600/20 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
 <Database className="w-5 h-5" /> Execute RAG Match
 </button>
 </div>
 </div>
 )}

 {/* Step 2: Problem Selection */}
 {step === 2 && (
 <div>
 <div className="flex justify-between items-center mb-6 border-b border-[var(--border)] pb-5">
 <div>
 <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-1">Retrieval Complete</p>
 <p className="text-xl font-bold text-[var(--foreground)]">Retrieved for {companyName}</p>
 </div>
 <button onClick={() => setStep(1)} className="text-[9px] font-bold text-[var(--primary)] uppercase border border-[var(--primary)]/20 px-4 py-2 rounded-lg hover:bg-[var(--primary)]/10">Reset</button>
 </div>
 <div className="grid md:grid-cols-3 gap-4">
 {dynamicProblems.map(p => (
 <button key={p.id} onClick={() => { setSelectedProblem(p); setStep(3); }}
 className="group text-left p-5 bg-black/20 border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] rounded-2xl hover:border-[var(--primary)]/40 hover:bg-[#0d0d10] transition-all">
 <div className="bg-[var(--primary)]/10 text-[var(--primary)] text-[8px] font-bold px-2 py-0.5 rounded w-fit mb-3 uppercase">RAG Match</div>
 <h4 className="font-bold text-[var(--foreground)] mb-2 text-sm group-hover:text-[var(--primary)] transition-colors">{p.title}</h4>
 <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed line-clamp-3 italic mb-3">&ldquo;{p.problem}&rdquo;</p>
 <div className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--primary)] uppercase pt-3 border-t border-[var(--border)]">
 <CheckCircle className="w-3 h-3" /> Evidence Synced
 </div>
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Step 3: Output */}
 {step === 3 && selectedProblem && (
 <div className="space-y-5">
 <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-[var(--background)] p-4 rounded-2xl border border-[var(--border)] gap-4">
 <div>
 <p className="text-[9px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Evidence Citation</p>
 <div className="flex items-center gap-2">
 <Layers className="w-4 h-4 text-[var(--primary)]" />
 <p className="text-sm font-bold text-[var(--primary)] italic">{selectedProblem.citation || "Library Default"}</p>
 </div>
 </div>
 <div className="bg-[var(--secondary)] p-1 rounded-xl flex flex-wrap gap-1">
 {(["Cold Email", "Startup Pitch", "Follow-up", "LinkedIn DM"] as OutputType[]).map(t => (
 <button key={t} onClick={() => setOutputType(t)}
 className={`px-4 py-2 text-[9px] font-bold uppercase rounded-lg transition-all ${outputType === t ? "bg-[var(--card)] text-[var(--primary)] shadow" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{t}</button>
 ))}
 </div>
 </div>

 <div className="bg-[#060608] rounded-2xl p-6 md:p-8 border border-[var(--border)] relative">
 <div className="text-sm leading-[1.8] text-[var(--foreground)] max-h-[400px] overflow-y-auto pr-2">
 {generateCopy(selectedProblem, outputType, contactName, companyName, role).split("\n\n").map((para, i) => {
 if (para.includes("• ")) {
 return (<ul key={i} className="list-disc pl-5 mb-4 space-y-1">
 {para.split("\n").filter(l => l.trim()).map((line, j) => (<li key={j}>{line.replace("• ", "")}</li>))}
 </ul>);
 }
 return (<p key={i} className="mb-4">{para.split("\n").map((line, j, arr) => (
 <React.Fragment key={j}>{line}{j !== arr.length - 1 && <br />}</React.Fragment>
 ))}</p>);
 })}
 </div>

 <div className="mt-6 pt-6 border-t border-[var(--border)] flex gap-3">
 <button onClick={() => handleCopy(generateCopy(selectedProblem, outputType, contactName, companyName, role))}
 className="flex-1 bg-white text-black py-3 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
 {copied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
 {copied ? "Copied!" : "Copy Message"}
 </button>
 <button onClick={() => setStep(2)} className="px-8 bg-[var(--secondary)] text-[var(--muted-foreground)] py-3 rounded-xl font-bold text-[11px] uppercase hover:text-[var(--foreground)] transition-all border border-[var(--border)]">Back</button>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 <footer className="text-center text-xs text-slate-600 py-6">RAG Orchestrator · Part of Job Outreach Suite</footer>
 </main>
 );
}
