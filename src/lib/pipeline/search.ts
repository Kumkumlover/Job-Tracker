/**
 * Consensus Search Engine
 *
 * Runs Serper (Google), Tavily AI, and Exa.ai simultaneously with queries
 * optimized for each engine's unique strengths. Results from multiple engines
 * are corroborated: profiles confirmed by 2+ independent sources are far more
 * likely to be current employees at the target company.
 *
 * Corroboration metadata is passed to the LLM ranking stage so it can factor
 * multi-source confirmation into its confidence scoring.
 *
 * Bug fixes included:
 *   Bug 1: Single LLM strategy build — strategy passed through, not rebuilt
 *   Bug 2: HR query no longer includes department name (over-filters HR people)
 *   Bug 3: Exclusion uses word-boundary regex, not substring includes
 *   (Bugs 4 & 5 are in rank.ts)
 */
import type { SearchResult } from "../types";
import { askJSON } from "../automation/llm";
import { searchTavily } from "./tavily";
import { searchExa } from "./exa";
import { createHash } from "crypto";
import { prisma } from "../prisma";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchStrategy {
  department: string;
  roleVariants: string[];
  deptKeywords: string;
  deptQuery: string;
  hrQuery: string;
  companyContext: string;
}

/** Extended SearchResult that tracks which engines found this profile */
export interface CorroboratedResult extends SearchResult {
  sources: string[]; // e.g. ["serper", "tavily", "exa"]
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Normalize a LinkedIn URL so results from different engines can be
 * deduplicated accurately.
 * e.g. "https://in.linkedin.com/in/john-doe?ref=xyz/" → "linkedin.com/in/john-doe"
 */
export function normalizeLinkedInUrl(url: string): string {
  if (!url) return "";
  return url
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.|[a-z]{2}\.)/, "") // strip subdomains: www. in. uk.
    .split("?")[0]
    .replace(/\/$/, "");
}

/**
 * Bug 3 Fix: word-boundary exclusion — "Ed" no longer filters "Edward".
 */
export function isCandidateExcluded(
  candidateName: string,
  excludeNames: string[]
): boolean {
  const clean = candidateName.trim().toLowerCase();
  for (const ex of excludeNames) {
    const cleanEx = ex.trim().toLowerCase();
    if (!cleanEx) continue;
    if (clean === cleanEx) return true;
    const escaped = cleanEx.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(clean)) return true;
  }
  return false;
}

/**
 * Heuristic score for a LinkedIn search result.
 */
export function scoreResult(
  title: string,
  snippet: string,
  url: string,
  deptKeywords: string = "",
  company: string = ""
): number {
  let score = 0;
  const t = title.toLowerCase();
  const s = snippet.toLowerCase();
  const dept = deptKeywords.toLowerCase();
  const comp = company.toLowerCase().trim();

  if (url.includes("linkedin.com/in/")) score += 3;
  if (title.length > 0) score += 0.5;

  const seniorityTerms = ["manager", "lead", "head", "director", "vp", "chief", "principal"];
  for (const k of seniorityTerms) {
    if (t.includes(k)) score += 2;
    if (s.includes(k)) score += 0.5;
  }

  if (dept) {
    const deptWords = dept.split(" ").filter((w) => w.length > 2);
    for (const dw of deptWords) {
      if (t.includes(dw)) score += 6;
      if (s.includes(dw)) score += 1;
    }
  }

  if (comp) {
    const safeComp = comp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const companyInSnippet = new RegExp(
      `(?:^|[^a-z0-9])${safeComp}(?:[^a-z0-9]|$)`
    ).test(s);
    const cleanNameForMatch = t
      .split(/[-—|]/)[0]
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    const isNameMatch = cleanNameForMatch.split(/\s+/).includes(comp);

    // CRITICAL FIX: Normalize and check if company name exists AT ALL
    const normalizedCompany = comp.replace(/[^a-z0-9]/g, "");
    const normalizedSnippet = s.replace(/[^a-z0-9]/g, "");
    const normalizedTitle = t.replace(/[^a-z0-9]/g, "");
    
    const hasCompanyAnywhere = normalizedSnippet.includes(normalizedCompany) || normalizedTitle.includes(normalizedCompany);

    if (!hasCompanyAnywhere) {
      // Immediate disqualification for semantic drift (e.g. Saber Money -> Money Fellows)
      score -= 100;
    } else {
      if (isNameMatch) {
        const strictMatch = new RegExp(
          `(?:at|@|of|for)\\s+${safeComp}(?:[^a-z0-9]|$)`
        ).test(s);
        score += strictMatch ? 5 : -50;
      } else if (companyInSnippet) {
        score += 5;
      }
    }
  }

  const isFounder = /\b(founder|co-founder|ceo|chief executive)\b/.test(t);
  const isHR =
    /\b(human resources|talent acquisition|recruiter|hrbp|hr business partner|people partner|people ops|people operations)\b/.test(
      t + " " + s
    );
  const hasDeptSignal =
    dept && dept.split(" ").some((w) => w.length > 2 && t.includes(w));
  if (isHR && !hasDeptSignal && !isFounder) score -= 5;

  return score;
}

// ---------------------------------------------------------------------------
// LLM Strategy Builder (called ONCE per search)
// ---------------------------------------------------------------------------

async function fetchCompanyContext(company: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "";
  
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${company} company overview employee count size`,
        search_depth: "basic",
        max_results: 3,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return (data.results || [])
      .map((r: any) => r.content)
      .join("\n")
      .substring(0, 1500);
  } catch (e) {
    return "";
  }
}

/**
 * Bug 1 Fix: This function is called exactly ONCE per request in searchCandidatesAuto
 * and the result is passed down — eliminating the duplicate LLM call.
 */
export async function buildSearchStrategyWithLLM(
  company: string,
  jobTitle: string,
  jd: string,
  excludeNames: string[] = []
): Promise<SearchStrategy> {
  if (!jd?.trim()) {
    return buildQueriesFallback(company, jobTitle, excludeNames);
  }

  try {
    const { loadPrompt } = await import("../automation/prompts/index");
    const { SearchStrategySchema } = await import("../evalArtifacts");
    const { askJSONValidated } = await import("../automation/llm");
    
    const companyContext = await fetchCompanyContext(company);
    const prompt = loadPrompt("searchStrategy_v1", {
      jobTitle,
      company,
      companyContext,
      jd: jd.substring(0, 1500)
    });

    const strategy = await askJSONValidated(prompt, SearchStrategySchema);
    if (!strategy?.hiringManagerTitles?.length) throw new Error("Empty strategy");

    const cleanJobTitle = jobTitle.replace(/"/g, "");
    const { deptQuery: fallbackQuery } = buildQueriesFallback(company, jobTitle, []);
    const fallbackMatch = fallbackQuery.match(/\((.*?)\)/);
    const fallbackVariants = fallbackMatch ? fallbackMatch[1].split(" OR ") : [];

    const isIntern = cleanJobTitle.toLowerCase().includes("intern");
    const rawVariants = [
      ...(isIntern ? [] : [`"${cleanJobTitle}"`]),
      ...strategy.hiringManagerTitles.map((r: string) => `"${r}"`),
      ...fallbackVariants,
    ];
    
    // Safety net: if it's a product role, force "Product Manager"
    if (jobTitle.toLowerCase().includes("product")) {
      rawVariants.push('"Product Manager"');
    }

    const uniqueVariants = Array.from(new Set(rawVariants))
      .filter(Boolean)
      .slice(0, 6);
    const exclusions =
      excludeNames.length > 0 ? excludeNames.map((n) => `-"${n}"`).join(" ") : "";

    const modifier = strategy.companyModifier ? ` "${strategy.companyModifier}"` : "";

    const deptQuery = `site:linkedin.com/in "${company}"${modifier} (${uniqueVariants.join(
      " OR "
    )})${exclusions ? ` ${exclusions}` : ""}`;

    // Bug 2 Fix: No department name in HR query — HR people don't list dept names in their titles
    const hrRawVariants =
      (strategy.hrTitles && strategy.hrTitles.length > 0)
        ? strategy.hrTitles.map((r: string) => `"${r}"`)
        : ['"Recruiter"', '"Talent Acquisition"', '"HR Business Partner"'];
    const hrUnique = Array.from(new Set(hrRawVariants)).slice(0, 4);
    const hrQuery = `site:linkedin.com/in "${company}"${modifier} (${hrUnique.join(
      " OR "
    )})${exclusions ? ` ${exclusions}` : ""}`;

    console.log(
      `[search] LLM strategy — dept: "${strategy.department}", variants: ${uniqueVariants.slice(0, 3).join(", ")}`
    );

    return {
      department: strategy.department,
      roleVariants: uniqueVariants,
      deptKeywords: strategy.deptKeywords || strategy.department,
      deptQuery,
      hrQuery,
      companyContext,
    };
  } catch (err) {
    console.warn("[search] LLM strategy failed, using heuristic fallback:", err);
    return buildQueriesFallback(company, jobTitle, excludeNames);
  }
}

/** Heuristic fallback when no JD is provided or LLM fails */
function buildQueriesFallback(
  company: string,
  jobTitle: string,
  excludeNames: string[] = []
): SearchStrategy {
  const seniority = [
    "senior", "junior", "lead", "staff", "principal", "associate",
    "assistant", "executive", "vice", "president", "chief",
  ];
  let deptKeywords = jobTitle.toLowerCase();
  for (const g of seniority) {
    deptKeywords = deptKeywords.replace(new RegExp(`\\b${g}\\b`, "gi"), "");
  }
  deptKeywords = deptKeywords.replace(/[^a-z0-9 ]/gi, " ").trim().replace(/\s+/g, " ");

  const titleLower = jobTitle.toLowerCase();
  const cleanJobTitle = jobTitle.replace(/"/g, "");
  
  // If hiring for an intern/junior, do NOT search for interns. Search for the managers.
  const isInternOrJunior = titleLower.includes("intern") || titleLower.includes("junior");
  const roleVariants: string[] = isInternOrJunior ? [] : [`"${cleanJobTitle}"`];

  if (titleLower.includes("product") || titleLower.includes(" pm") || titleLower.includes("apm")) {
    roleVariants.push('"Product Manager"', '"Senior Product Manager"', '"Head of Product"', '"VP Product"', '"Director of Product"', '"Founder"');
  } else if (titleLower.includes("engineer") || titleLower.includes("developer")) {
    roleVariants.push('"Engineer"', '"Tech Lead"', '"Engineering Manager"', '"CTO"', '"Founder"');
  } else if (titleLower.includes("data") || titleLower.includes("analyst")) {
    roleVariants.push('"Data Analyst"', '"Data Scientist"', '"Analytics Lead"', '"Head of Data"');
  } else if (titleLower.includes("design")) {
    roleVariants.push('"Designer"', '"Design Lead"', '"UX Lead"', '"Head of Design"');
  } else {
    roleVariants.push('"Manager"', '"Lead"', '"Director"', '"Head"', '"Founder"');
  }

  const exclusions = excludeNames.length > 0 ? excludeNames.map((n) => `-"${n}"`).join(" ") : "";
  const deptQuery = `site:linkedin.com/in "${company}" (${roleVariants.join(" OR ")})${exclusions ? ` ${exclusions}` : ""}`;
  // Bug 2 Fix applied here too
  const hrQuery = `site:linkedin.com/in "${company}" (Recruiter OR "Talent Acquisition" OR "HR Business Partner" OR "People Partner")${exclusions ? ` ${exclusions}` : ""}`;

  return { department: deptKeywords, roleVariants, deptKeywords, deptQuery, hrQuery, companyContext: "" };
}

// ---------------------------------------------------------------------------
// Individual API Callers
// ---------------------------------------------------------------------------

async function callSerper(
  deptQuery: string,
  hrQuery: string,
  apiKey: string
): Promise<SearchResult[]> {
  async function runQuery(q: string) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 10 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
    const data = await res.json();
    return (data.organic || []) as any[];
  }

  const [deptPage1, deptPage2, hrItems] = await Promise.allSettled([
    runQuery(deptQuery),
    runQuery(deptQuery.replace("page=1", "page=2")),
    runQuery(hrQuery),
  ]);

  const items = [
    ...((deptPage1.status === "fulfilled" ? deptPage1.value : []) as any[]).map((i: any) => ({ ...i, _boost: 5 })),
    ...((deptPage2.status === "fulfilled" ? deptPage2.value : []) as any[]).map((i: any) => ({ ...i, _boost: 5 })),
    ...((hrItems.status === "fulfilled" ? hrItems.value : []) as any[]),
  ];

  return items
    .filter((item: any) => (item.link || "").includes("linkedin.com/in/"))
    .map((item: any) => ({
      url: (item.link || "").split("?")[0].replace(/\/$/, ""),
      title: (item.title || "").split("-")[0].trim().split("|")[0].trim(),
      snippet: item.snippet || "",
      domain: "linkedin.com",
      score: item._boost || 0,
      source: "serper" as const,
    }));
}

// ---------------------------------------------------------------------------
// Cache Helpers
// ---------------------------------------------------------------------------

function buildCacheKey(company: string, jobTitle: string): string {
  const normalized = `v3::${company.toLowerCase().trim()}::${jobTitle.toLowerCase().trim()}`;
  return createHash("sha256").update(normalized).digest("hex");
}

async function getCachedResults(
  cacheKey: string
): Promise<{ results: SearchResult[]; deptKeywords: string; companyContext: string } | null> {
  try {
    const cached = await prisma.searchCache.findFirst({
      where: { cacheKey, expiresAt: { gt: new Date() } },
    });
    if (!cached) return null;
    console.log(`[search] Cache HIT for key ${cacheKey.slice(0, 8)}…`);
    return {
      results: cached.results as unknown as SearchResult[],
      deptKeywords: cached.deptKeywords,
      companyContext: cached.companyContext,
    };
  } catch {
    return null; // DB errors must never crash the search
  }
}

async function setCachedResults(
  cacheKey: string,
  company: string,
  jobTitle: string,
  results: SearchResult[],
  deptKeywords: string,
  companyContext: string
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000); // 21 days
    await prisma.searchCache.upsert({
      where: { cacheKey },
      update: { results: results as any, deptKeywords, companyContext, expiresAt },
      create: { cacheKey, company, jobTitle, results: results as any, deptKeywords, companyContext, expiresAt },
    });
  } catch (err) {
    console.warn("[search] Failed to write search cache:", err);
  }
}

// ---------------------------------------------------------------------------
// Consensus Engine — core logic
// ---------------------------------------------------------------------------

/**
 * Runs all 3 search engines in parallel with engine-optimized queries,
 * then corroborates results. Profiles found by multiple independent sources
 * are surfaced with their source list so the LLM can factor this into its ranking.
 */
export async function searchCandidates(
  company: string,
  jobTitle: string,
  excludeNames: string[] = [],
  jd: string = "",
  precomputedStrategy?: SearchStrategy
): Promise<CorroboratedResult[]> {
  const strategy =
    precomputedStrategy ||
    (await buildSearchStrategyWithLLM(company, jobTitle, jd, excludeNames));

  const serperKey = process.env.SERPER_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  console.log(`[consensus] Firing all available engines for "${company}"…`);

  // Fire all 3 engines simultaneously
  const [serperRes, tavilyRes, exaRes] = await Promise.allSettled([
    serperKey
      ? callSerper(strategy.deptQuery, strategy.hrQuery, serperKey)
      : Promise.resolve([] as SearchResult[]),
    tavilyKey
      ? searchTavily(company, strategy.deptKeywords, strategy.roleVariants)
      : Promise.resolve([] as SearchResult[]),
    exaKey
      ? searchExa(company, strategy.deptKeywords, jobTitle)
      : Promise.resolve([] as SearchResult[]),
  ]);

  const serperResults = serperRes.status === "fulfilled" ? serperRes.value : [];
  const tavilyResults = tavilyRes.status === "fulfilled" ? tavilyRes.value : [];
  const exaResults = exaRes.status === "fulfilled" ? exaRes.value : [];

  if (serperRes.status === "rejected") console.error("[consensus] Serper failed:", serperRes.reason);
  if (tavilyRes.status === "rejected") console.error("[consensus] Tavily failed:", tavilyRes.reason);
  if (exaRes.status === "rejected") console.error("[consensus] Exa failed:", exaRes.reason);

  console.log(
    `[consensus] Raw results — Serper: ${serperResults.length}, Tavily: ${tavilyResults.length}, Exa: ${exaResults.length}`
  );

  // Build a normalized URL → sources map for corroboration tracking
  const urlToSources = new Map<string, Set<string>>();
  const urlToResult = new Map<string, SearchResult>();

  for (const [engineResults, engineName] of [
    [serperResults, "serper"],
    [tavilyResults, "tavily"],
    [exaResults, "exa"],
  ] as [SearchResult[], string][]) {
    for (const r of engineResults) {
      if (!r.url.includes("linkedin.com/in/")) continue;
      const normUrl = normalizeLinkedInUrl(r.url);
      if (!normUrl) continue;

      if (!urlToSources.has(normUrl)) {
        urlToSources.set(normUrl, new Set());
        // Prefer the result with the most snippet content as the canonical entry
        urlToResult.set(normUrl, r);
      } else {
        // Merge: keep whichever snippet is longer
        const existing = urlToResult.get(normUrl)!;
        if ((r.snippet || "").length > (existing.snippet || "").length) {
          urlToResult.set(normUrl, { ...existing, snippet: r.snippet, title: r.title || existing.title });
        }
      }
      urlToSources.get(normUrl)!.add(engineName);
    }
  }

  // Build corroborated result list with heuristic scoring
  const corroborated: CorroboratedResult[] = [];
  for (const [normUrl, sources] of urlToSources.entries()) {
    const r = urlToResult.get(normUrl)!;
    const cleanTitle = (r.title || "").split("-")[0].trim().split("|")[0].trim();
    let baseScore = scoreResult(cleanTitle, r.snippet, r.url, strategy.deptKeywords, company);
    const sourcesArr = Array.from(sources);

    // Apply corroboration bonus
    if (sourcesArr.length === 3) baseScore += 20;
    else if (sourcesArr.length === 2) baseScore += 10;

    corroborated.push({
      url: r.url.split("?")[0].replace(/\/$/, ""),
      title: cleanTitle,
      snippet: r.snippet,
      domain: "linkedin.com",
      score: baseScore,
      sources: sourcesArr,
    });
  }

  // Sort by score descending and return top 25 for LLM ranking
  return corroborated.sort((a, b) => b.score - a.score).slice(0, 25);
}

// ---------------------------------------------------------------------------
// JD Contact Extraction
// ---------------------------------------------------------------------------

export function extractContactsFromJD(
  jd: string
): Array<{ name: string; context: string; email?: string }> {
  if (!jd) return [];
  const contacts: Array<{ name: string; email?: string; context: string }> = [];
  const seen = new Set<string>();

  const emailRegex = /([a-zA-Z][a-zA-Z0-9_.+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = emailRegex.exec(jd)) !== null) {
    const localPart = emailMatch[1];
    const fullEmail = emailMatch[0];
    const genericPrefixes = ["info","hr","hello","contact","support","noreply","admin","careers","jobs","hiring","team"];
    if (genericPrefixes.some((g) => localPart.toLowerCase().startsWith(g))) continue;

    const parts = localPart
      .replace(/[._-]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter((p) => p.length > 0)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    if (parts.length >= 2) {
      const name = parts.join(" ");
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        contacts.push({ name, email: fullEmail, context: `Email mentioned in JD: ${fullEmail}` });
      }
    }
  }

  const stopWords = new Set(["product","manager","happy","work","full","early","strong","looking","platform","customer","associate","senior","junior","what","where","when","this","that","will","from","have","your","with","about","more","here","good","great"]);
  function isValidName(name: string): boolean {
    const words = name.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    for (const w of words) {
      if (!/^[A-Z][a-z]+$/.test(w)) return false;
      if (stopWords.has(w.toLowerCase())) return false;
    }
    return name.length >= 5;
  }

  const patterns = [
    /(?:drop\s+(?:me\s+or\s+)?|reach\s+out\s+to\s+|contact\s+|message\s+|ping\s+|connect\s+with\s+|email\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(jd)) !== null) {
      const name = m[1].trim();
      if (!isValidName(name) || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      contacts.push({ name, context: "Mentioned in JD as contact person" });
    }
  }
  return contacts;
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

export async function searchCandidatesAuto(
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = []
): Promise<{
  results: CorroboratedResult[];
  jdContacts: any[];
  localApiUsage: { search: number };
  deptKeywords: string;
  companyContext: string;
}> {
  let jdContacts: any[] = [];
  if (jd && jd.trim().length > 10) {
    jdContacts = extractContactsFromJD(jd);
  }

  const knownNames = jdContacts.map((c) => c.name);
  const combinedExcludes = [...excludeNames, ...knownNames];

  // Check cache first (21-day TTL)
  const cacheKey = buildCacheKey(company, jobTitle);
  const cached = await getCachedResults(cacheKey);
  if (cached) {
    // Still apply exclude filter on cached results in case user cycled through people
    let cachedResults = (cached.results as CorroboratedResult[]).filter(
      (r) => !isCandidateExcluded(r.title, combinedExcludes)
    );
    cachedResults = cachedResults.filter((r) => r.score > -40);
    return {
      results: cachedResults,
      jdContacts,
      localApiUsage: { search: 0 }, // 0 because we served from cache
      deptKeywords: cached.deptKeywords,
      companyContext: "", // Cached searches already used the context
    };
  }

  // Bug 1 Fix: Build strategy ONCE, pass it down — no second LLM call
  const strategy = await buildSearchStrategyWithLLM(company, jobTitle, jd ?? "", combinedExcludes);

  const enginesUsed =
    (process.env.SERPER_API_KEY ? 2 : 0) + // dept + hr query
    (process.env.TAVILY_API_KEY ? 1 : 0) +
    (process.env.EXA_API_KEY ? 1 : 0);

  let searchResults: CorroboratedResult[] = [];
  try {
    searchResults = await searchCandidates(company, jobTitle, combinedExcludes, jd ?? "", strategy);
  } catch (err) {
    console.error("[search] Consensus engine failed:", err);
  }

  // Generic email fallback if truly nothing found
  if (searchResults.length === 0 && jdContacts.length === 0) {
    const cleanDomain = company.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    jdContacts.push(
      { name: "Careers Team", email: `careers@${cleanDomain}.com`, context: "Fallback generic careers email" },
      { name: "HR Team", email: `hr@${cleanDomain}.com`, context: "Fallback generic HR email" }
    );
  }

  // Bug 3 Fix: word-boundary exclusion
  if (combinedExcludes.length > 0) {
    searchResults = searchResults.filter(
      (r) => !isCandidateExcluded(r.title, combinedExcludes)
    );
  }

  // Filter heavy penalty false positives
  searchResults = searchResults.filter((r) => r.score > -40);

  // Persist to cache for future searches
  if (searchResults.length > 0) {
    await setCachedResults(cacheKey, company, jobTitle, searchResults, strategy.deptKeywords, strategy.companyContext);
  }

  return {
    results: searchResults,
    jdContacts,
    localApiUsage: { search: enginesUsed },
    deptKeywords: strategy.deptKeywords,
    companyContext: strategy.companyContext,
  };
}
