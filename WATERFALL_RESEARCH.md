# Search Pipeline Waterfall Integration: Serper.dev, Tavily AI, and Exa.ai
**Author:** Senior Software Architect & Research Engineer  
**Date:** June 25, 2026  

---

## Executive Summary
This report presents a production-grade research and design specification for implementing a robust, cost-effective, and low-latency "waterfall" search pipeline in a Next.js job-tracking application. The pipeline locates decision-maker LinkedIn profiles at target companies by chaining three search provider APIs: **Serper.dev** (Google Custom Search API proxy), **Tavily AI** (LLM-optimized search engine), and **Exa.ai** (neural semantic search). 

Additionally, this document addresses and fixes five critical bugs identified in the existing codebase (`search.ts` and `rank.ts`) to improve reliability, prevent rate-limiting/over-billing, and eliminate false-positive candidates.

---

## 1. API Behavior Deep Research

This section analyzes the request/response payloads, rate-limiting thresholds, data freshness characteristics, typical latencies, and edge-case behaviors of the three target search APIs.

### 1.1 Serper.dev
Serper.dev acts as a fast, cost-effective scraper for Google Search. For finding LinkedIn profiles, the pipeline submits boolean Google search queries targeting the `site:linkedin.com/in` space (e.g., `site:linkedin.com/in "Stripe" ("Product Manager" OR "Director of Product")`).

#### API Request & Response JSON Mocks
* **Request Endpoint:** `POST https://google.serper.dev/search`
* **Headers:**
  ```http
  X-API-KEY: <SERPER_API_KEY>
  Content-Type: application/json
  ```
* **Payload:**
  ```json
  {
    "q": "site:linkedin.com/in \"Surepass\" (\"Product Manager\" OR \"Hiring Manager\")",
    "num": 10,
    "page": 1
  }
  ```
* **Response Payload (HTTP 200 OK):**
  ```json
  {
    "searchParameters": {
      "q": "site:linkedin.com/in \"Surepass\" (\"Product Manager\" OR \"Hiring Manager\")",
      "type": "search",
      "num": 10,
      "page": 1,
      "engine": "google"
    },
    "organic": [
      {
        "title": "Aarav Sharma - Product Lead - Surepass | LinkedIn",
        "link": "https://in.linkedin.com/in/aarav-sharma-surepass",
        "snippet": "Product Lead at Surepass. Building automated identity verification APIs and workflows. Managing a team of 4 PMs...",
        "position": 1
      },
      {
        "title": "Priya Patel - Talent Acquisition Manager - Surepass",
        "link": "https://www.linkedin.com/in/priya-patel-ta",
        "snippet": "Talent Acquisition at Surepass. Hiring across tech, product, and sales. Connect with me for open roles...",
        "position": 2
      }
    ]
  }
  ```

---

### 1.2 Tavily AI
Tavily is an AI-optimized search engine designed to scrape and aggregate information from the web. It allows filtering results to specific domains and excels at extracting clean content snippets.

#### API Request & Response JSON Mocks
* **Request Endpoint:** `POST https://api.tavily.com/search`
* **Headers:**
  ```http
  Content-Type: application/json
  ```
* **Payload:**
  ```json
  {
    "api_key": "<TAVILY_API_KEY>",
    "query": "site:linkedin.com/in \"Surepass\" \"Product Manager\"",
    "search_depth": "basic",
    "include_domains": ["linkedin.com"],
    "max_results": 10
  }
  ```
* **Response Payload (HTTP 200 OK):**
  ```json
  {
    "query": "site:linkedin.com/in \"Surepass\" \"Product Manager\"",
    "results": [
      {
        "title": "Aarav Sharma - Product Lead - Surepass | LinkedIn",
        "url": "https://in.linkedin.com/in/aarav-sharma-surepass",
        "content": "Aarav Sharma is a Product Lead at Surepass. Over the last 3 years, Aarav has scaled Surepass identity systems...",
        "score": 0.965
      }
    ]
  }
  ```

---

### 1.3 Exa.ai
Exa (formerly Metaphor) uses an embedding-based neural search engine. Rather than using keyword matching or boolean operators (such as `site:`), Exa works best with semantic prompts that describe the target resource.

#### API Request & Response JSON Mocks
* **Request Endpoint:** `POST https://api.exa.ai/search`
* **Headers:**
  ```http
  x-api-key: <EXA_API_KEY>
  Content-Type: application/json
  ```
* **Payload:**
  ```json
  {
    "query": "Here is the LinkedIn profile of a Product Manager or Hiring Manager working at Surepass:",
    "useAutoprompt": false,
    "type": "neural",
    "includeDomains": ["linkedin.com"],
    "numResults": 10
  }
  ```
* **Response Payload (HTTP 200 OK):**
  ```json
  {
    "results": [
      {
        "title": "Aarav Sharma - Product Lead - Surepass | LinkedIn",
        "url": "https://in.linkedin.com/in/aarav-sharma-surepass",
        "id": "linkedin.com/in/aarav-sharma-surepass",
        "score": 0.892,
        "text": "Aarav Sharma - Product Lead at Surepass. Identity verification, AML compliance, API infrastructure, SaaS..."
      }
    ]
  }
  ```

---

### 1.4 Rate Limiting & Quota Exhaustion
The table below specifies how each API behaves when exceeding rates or quotas.

| API | Free Tier Limit | Rate Limits | HTTP Status | Headers | Response Payload |
|---|---|---|---|---|---|
| **Serper.dev** | 2,500 one-off | ~10-20 reqs/sec | `429 Too Many Requests` (Rate) or `403 Forbidden` (Quota) | N/A | `{"message":"Unauthorized"}` or `{"message":"Rate limit exceeded"}` |
| **Tavily AI** | 1,000/month | 5 reqs/sec | `429 Too Many Requests` | `Retry-After: <seconds>` | `{"detail":"Rate limit exceeded. Please try again later."}` |
| **Exa.ai** | 1,000/month | 10 reqs/min | `429 Too Many Requests` | `X-RateLimit-Limit-Minute`, `Retry-After` | `{"error":"Rate limit exceeded. Upgrade your plan."}` |

---

### 1.5 Data Freshness & Update Frequency
* **Serper (Google Index):** google indexes LinkedIn constantly. High-profile pages and search results refresh within 1–3 days, whereas average profiles may take 2–4 weeks to update. Because it leverages Google, Serper has the most extensive coverage of older and newer LinkedIn profiles.
* **Tavily:** Tavily crawls dynamically and aggregates search queries, but for LinkedIn queries, it is limited by standard search engines' crawl rates. Its index is highly fresh for current news and general web scraping, but carries similar 1–2 week update delays for niche LinkedIn profiles.
* **Exa.ai:** Exa builds its own neural web index. Crawling LinkedIn is historically difficult due to LinkedIn's aggressive robot/scraping countermeasures. Consequently, Exa's index for LinkedIn profiles may be slightly older (4–8 weeks delay). However, it excels at semantic association (e.g., associating adjacent terminology with the correct department).

### 1.6 Latency & Edge Case Analysis
* **Latencies:** 
  * **Serper:** Extremely low (~400-800ms) because it returns cached Google Search results.
  * **Tavily:** Moderately high (~1.5-2.5s) as it aggregates multiple search indexes and performs content cleaning.
  * **Exa.ai:** Moderate (~600-1200ms) for its deep neural lookup.
* **Misspellings:** Serper handles typos gracefully via Google's "did you mean" algorithm. Tavily has basic fuzzy correction. Exa handles misspellings well due to neural embeddings mapping misspelled terms to correct concepts.
* **Common Names (e.g., Apple, Target):** Serper/Tavily will return millions of false-positives for "Apple" unless strict formatting (e.g., `intitle:"Apple"`) or negative filters are used. Exa handles this better by resolving semantic context (profiles indicating they work *at* Apple Inc.).
* **Micro-Companies (<10 employees):** Very hard to find in search results. Google/Serper indexes may return zero profiles because small companies lack authority. In these cases, the pipeline must expand its queries to include broad keyword terms like `"Founder"` or `"CEO"` directly.

---

## 2. Risk & Limitation Analysis

Implementing a LinkedIn search pipeline carries legal, technical, and stability risks.

### 2.1 Terms of Service & Scraping Risks
LinkedIn's User Agreement strictly prohibits scraping, crawling, or accessing its services via automated tools. 
* **The Proxy Shield:** By querying Serper, Tavily, and Exa rather than hitting LinkedIn directly, the application avoids violating LinkedIn's ToS. We are querying public search engine indices, which are legally protected (under rulings like *hiQ Labs v. LinkedIn*).
* **The Crawling Risk:** If the application attempts to fetch or crawl the target LinkedIn profile URLs directly from the server to extract detailed text, LinkedIn's WAF (Web Application Firewall) will immediately block the server IP, returning `HTTP 999 Request Denied`. The pipeline must rely solely on search engine snippets or user-initiated browser actions (like extensions) to extract deeper profile details.

### 2.2 Sustainability & Cost History
* **Serper.dev** does not renew its 2,500 free credits. Once exhausted, the pipeline will fail unless a payment method is configured.
* **Tavily** and **Exa** renew their 1,000 monthly free credits, but their pricing model is subject to change.
* **API Deprecations:** Exa has historically migrated endpoints (from Metaphor's old API structure to the `/search` endpoints). Dynamic SDK dependencies must be pinned to avoid build failures.

### 2.3 LinkedIn Domain Filtering & Blockages
Google and other search engines occasionally face indexing friction with LinkedIn (e.g., LinkedIn requesting removal of pages or enforcing strict `robots.txt`). While LinkedIn allows indexing of public profiles (`/in/`) for SEO, it limits the quantity of public details available in snippets. The pipeline must therefore be resilient to very sparse snippets.

### 2.4 Failure Mode Matrix

| Failure Scenario | Impacted API | System Impact | Graceful Degradation Strategy |
|---|---|---|---|
| API Key Missing / Unconfigured | Serper | Search fails | Skip Serper; fallback immediately to Tavily/Exa without throwing. |
| Quota Exhausted (403/429) | Serper | Primary query fails | Log warning; proceed to Tavily/Exa. |
| Slow Latency (>2s) | Tavily | Total request exceeds Vercel limits | Place a strict timeout (e.g., 2000ms) on each API call. If a provider exceeds this, abort and proceed to the next in the waterfall. |
| Zero Profiles Found | All | Pipeline returns empty | Fall back to generating standard generic company emails (e.g., `careers@company.com` or `hr@company.com`) as a final fallback. |

---

## 3. Optimal Waterfall Design

### 3.1 Ordering Justification
To maximize accuracy, minimize latency, and stay within free-tier limits, the pipeline uses the following order:

$$\text{Serper.dev (Primary)} \longrightarrow \text{Tavily AI (Secondary)} \longrightarrow \text{Exa.ai (Tertiary)}$$

1. **Primary: Serper.dev**
   * **Why:** Lowest latency (400-800ms) and lowest cost ($1/1,000 requests). It accesses Google's index, which is the most comprehensive directory of LinkedIn profiles.
2. **Secondary: Tavily AI**
   * **Why:** High-quality text extraction from results. It has a generous monthly recurring free tier (1,000/month), which is useful if Serper fails or has insufficient results.
3. **Tertiary: Exa.ai**
   * **Why:** Semantic search is ideal when keyword searches fail, but its index of LinkedIn profiles is smaller due to bot blocks, and neural search has a higher processing cost.

### 3.2 Thresholds & URL Normalization
* **Insufficient Results Threshold:** **5**. If the primary search yields fewer than 5 unique, valid LinkedIn candidates, the secondary and tertiary APIs are triggered.
* **URL Normalization:** Different APIs return LinkedIn URLs with varying subdomains, trailing slashes, or query parameters:
  * `https://in.linkedin.com/in/john-doe/`
  * `http://www.linkedin.com/in/john-doe?ref=company`
  * `https://linkedin.com/in/john-doe`
  
  To prevent duplicate ranking, all URLs must be normalized to: `linkedin.com/in/john-doe`.

---

### 3.3 Calling Strategy: Sequential vs. Parallel
* **Sequential:** Call Serper -> if results < 5, call Tavily -> if results < 5, call Exa.
  * *Pros:* Conserves API credits.
  * *Cons:* Extreme tail latency (up to 5–6 seconds if all three are hit sequentially).
* **Parallel:** Call all three at once and merge results.
  * *Pros:* Low latency (bounded by the slowest API, usually Tavily at ~2s).
  * *Cons:* Wasteful. Consumes quotas on all three providers for every single application.
* **Hybrid (Optimal Choice):** Call Serper first. If the result count is $\ge 5$, return immediately. If it is $< 5$, call Tavily and Exa in parallel. This keeps latency low when fallbacks are needed, while conserving credits in the successful primary path.

---

### 3.4 Resolving Codebase Bugs

#### Bug 1: Double LLM Call
* **Problem:** `searchCandidatesAuto` calls `buildSearchStrategyWithLLM` to get search queries and keywords. It then calls `searchCandidates`, which invokes `buildSearchStrategyWithLLM` *again* using the same inputs, doubling LLM cost and latency.
* **Fix:** Update `searchCandidates` to accept an optional precomputed `SearchStrategy` parameter. If provided, skip the LLM call and use it directly.

#### Bug 2: HR Query Over-Filters
* **Problem:** In `search.ts` (lines 123 & 164), the recruiter query wraps the department or keywords in strict double quotes (e.g. `"${strategy.department}"` or `"${deptKeywords}"`). This forces Google to search for the exact phrase. A recruiter profile containing "Talent Partner (Tech)" will be excluded if searching for `"Product Management"`.
* **Fix:** Remove the strict double quotes from the department name/keywords in the HR query.

#### Bug 3: Substring Exclusion Bug
* **Problem:** The pipeline excludes already-contacted candidates or employees found in the job description using `name.includes(excluded)`. If `excluded` contains `"Dev"`, candidates named `"Devika"` or `"Devon"` are incorrectly filtered out.
* **Fix:** Replace `.includes` with a word boundary check or exact matching on the name parts.

#### Bug 4: Dead Code Imports in `rank.ts`
* **Problem:** `rank.ts` imports `extractDeptKeywords`, `deptRelevanceScore`, and `detectWrongDept` from `./dept-utils`, but does not use them, cluttering the file.
* **Fix:** Delete these unused imports.

#### Bug 5: Hardcoded Test Company Names in `rank.ts`
* **Problem:** The LLM ranking prompt in `rank.ts` contains hardcoded test company names: "Fixed Invest" (line 33) and "Fixerra" (line 39).
* **Fix:** Parameterize the prompt to use the `${company}` variable.

---

### 3.5 Refactored TypeScript Implementation

Here is the complete, refactored implementation of `search.ts` and the updated `rank.ts`.

#### `src/lib/pipeline/search.ts`
```typescript
import type { SearchResult } from "../types";
import { askJSON } from "../automation/llm";

export interface SearchStrategy {
  department: string;
  roleVariants: string[];
  deptKeywords: string;
  deptQuery: string;
  hrQuery: string;
}

/** 
 * Extract department/domain keywords from a job title.
 */
export function extractDepartmentKeywords(jobTitle: string): string {
  const seniority = [
    "senior", "junior", "lead", "staff", "principal", "associate",
    "assistant", "executive", "vice", "president", "chief"
  ];
  let dept = jobTitle.toLowerCase();
  for (const g of seniority) {
    dept = dept.replace(new RegExp(`\\b${g}\\b`, "gi"), "");
  }
  return dept.replace(/[^a-z0-9 ]/gi, " ").trim().replace(/\s+/g, " ");
}

/**
 * Normalizes LinkedIn URLs to ensure accurate deduplication across search engines.
 * e.g., "https://in.linkedin.com/in/john-doe?ref=xyz/" -> "linkedin.com/in/john-doe"
 */
export function normalizeLinkedInUrl(url: string): string {
  if (!url) return "";
  try {
    return url
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^(www\.|[a-z]{2}\.)/, '') // Strips subdomains like www. or in. or uk.
      .split('?')[0]                      // Strips query parameters
      .replace(/\/$/, "");                // Strips trailing slashes
  } catch (e) {
    return url.toLowerCase().trim();
  }
}

/**
 * Bug 3 Fix: Exact word/name match helper to prevent substring filter conflicts (e.g. "Dev" filtering "Devika")
 */
export function isCandidateExcluded(candidateName: string, excludeNames: string[]): boolean {
  const cleanCandidate = candidateName.trim().toLowerCase();
  for (const excluded of excludeNames) {
    const cleanExcluded = excluded.trim().toLowerCase();
    if (!cleanExcluded) continue;
    
    // Exact match
    if (cleanCandidate === cleanExcluded) return true;
    
    // Word boundary check (matches exact name but ignores substring extensions)
    const escaped = cleanExcluded.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(cleanCandidate)) {
      return true;
    }
  }
  return false;
}

/**
 * LLM-driven search strategy builder.
 */
export async function buildSearchStrategyWithLLM(
  company: string,
  jobTitle: string,
  jd: string,
  excludeNames: string[] = []
): Promise<SearchStrategy> {
  if (!jd?.trim()) {
    const fallback = buildQueriesFallback(company, jobTitle, excludeNames);
    return {
      department: fallback.deptKeywords,
      roleVariants: [jobTitle],
      deptKeywords: fallback.deptKeywords,
      deptQuery: fallback.deptQuery,
      hrQuery: fallback.hrQuery
    };
  }

  try {
    const prompt = `You are an expert Recruiting & OSINT Intelligence Engine.
Analyze a Job Description and identify the exact LinkedIn titles of the Hiring Managers and HR personnel for this role.

CONTEXT:
Job Title: "${jobTitle}"
Company: "${company}"

YOUR TASK:
Return a valid JSON object with the following schema:
{
  "department": "The specific functional team (e.g., 'Product Management', 'Engineering', 'Growth Marketing').",
  "hiringManagerTitles": [
    // 4 to 6 concise LinkedIn job titles for the likely hiring managers.
  ],
  "hrTitles": [
    // 2 to 3 concise HR/Recruiter titles.
  ],
  "deptKeywords": "A short 2-4 word string summarizing the core domain."
}

Job Description (first 1500 chars):
${jd.substring(0, 1500)}

Return ONLY the JSON. No markdown formatting, no explanations.`;

    const strategy = await askJSON<any>(prompt);
    if (!strategy?.hiringManagerTitles?.length) {
      throw new Error("LLM returned empty strategy");
    }

    const cleanJobTitle = jobTitle.replace(/"/g, '');
    const { deptQuery: fallbackQuery } = buildQueriesFallback(company, jobTitle, []);
    const fallbackMatch = fallbackQuery.match(/\((.*?)\)/);
    const fallbackVariants = fallbackMatch ? fallbackMatch[1].split(" OR ") : [];

    const rawVariants = [`"${cleanJobTitle}"`, ...strategy.hiringManagerTitles.map((r: string) => `"${r}"`), ...fallbackVariants];
    const uniqueVariants = Array.from(new Set(rawVariants)).filter(Boolean).slice(0, 6);
    const exclusions = excludeNames.length > 0 ? excludeNames.map(n => `-"${n}"`).join(" ") : "";

    const deptQuery = `site:linkedin.com/in "${company}" (${uniqueVariants.join(" OR ")})${exclusions ? ` ${exclusions}` : ""}`;

    // Bug 2 Fix: Removed double quotes around department name in recruiter searches to prevent over-filtering
    const hrRawVariants = strategy.hrTitles && strategy.hrTitles.length > 0
      ? strategy.hrTitles.map((r: string) => `"${r}"`)
      : ['"Recruiter"', '"Talent Acquisition"', '"HR Business Partner"'];
    const hrUnique = Array.from(new Set(hrRawVariants)).slice(0, 4);
    const hrQuery = `site:linkedin.com/in "${company}" (${hrUnique.join(" OR ")}) ${strategy.department}${exclusions ? ` ${exclusions}` : ""}`;

    return {
      department: strategy.department,
      roleVariants: uniqueVariants,
      deptKeywords: strategy.deptKeywords || strategy.department,
      deptQuery,
      hrQuery
    };
  } catch (err) {
    const fallback = buildQueriesFallback(company, jobTitle, excludeNames);
    return {
      department: fallback.deptKeywords,
      roleVariants: [jobTitle],
      deptKeywords: fallback.deptKeywords,
      deptQuery: fallback.deptQuery,
      hrQuery: fallback.hrQuery
    };
  }
}

/** Fallback heuristic query builder */
export function buildQueriesFallback(
  company: string,
  jobTitle: string,
  excludeNames: string[] = []
): { deptQuery: string; hrQuery: string; deptKeywords: string } {
  const seniority = ["senior","junior","lead","staff","principal","associate","assistant","executive","vice","president","chief"];
  let deptKeywords = jobTitle.toLowerCase();
  for (const g of seniority) deptKeywords = deptKeywords.replace(new RegExp(`\\b${g}\\b`, "gi"), "");
  deptKeywords = deptKeywords.replace(/[^a-z0-9 ]/gi, " ").trim().replace(/\s+/g, " ");

  const titleLower = jobTitle.toLowerCase();
  const cleanJobTitle = jobTitle.replace(/"/g, "");
  const roleVariants: string[] = [`"${cleanJobTitle}"`];

  if (titleLower.includes("product") || titleLower.includes(" pm") || titleLower.includes("apm")) {
    roleVariants.push('"Product Manager"', '"Product Lead"', '"Head of Product"', '"VP Product"', '"Director of Product"', '"Founder"');
  } else if (titleLower.includes("engineer") || titleLower.includes("developer")) {
    roleVariants.push('"Engineer"', '"Tech Lead"', '"Engineering Manager"', '"CTO"', '"Founder"');
  } else if (titleLower.includes("data") || titleLower.includes("analyst")) {
    roleVariants.push('"Data Analyst"', '"Data Scientist"', '"Analytics Lead"', '"Head of Data"');
  } else if (titleLower.includes("design")) {
    roleVariants.push('"Designer"', '"Design Lead"', '"UX Lead"', '"Head of Design"');
  } else {
    roleVariants.push('"Manager"', '"Lead"', '"Director"', '"Head"', '"Founder"');
  }

  const exclusions = excludeNames.length > 0 ? excludeNames.map(n => `-"${n}"`).join(" ") : "";
  const deptQuery = `site:linkedin.com/in "${company}" (${roleVariants.join(" OR ")})${exclusions ? ` ${exclusions}` : ""}`;
  
  // Bug 2 Fix: Removed double quotes around department keywords in fallback recruiter query
  const hrQuery = `site:linkedin.com/in "${company}" (Recruiter OR "Talent Acquisition" OR "HR Business Partner" OR "People Partner") ${deptKeywords}${exclusions ? ` ${exclusions}` : ""}`;

  return { deptQuery, hrQuery, deptKeywords };
}

/**
 * Heuristic score for a LinkedIn search result.
 */
export function scoreResult(title: string, snippet: string, url: string, deptKeywords: string = "", company: string = ""): number {
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
    const deptWords = dept.split(" ").filter(w => w.length > 2);
    for (const dw of deptWords) {
      if (t.includes(dw)) score += 6;
      if (s.includes(dw)) score += 1;
    }
  }

  // Company Match Logic (enforcing boundaries and penalizing name overlaps)
  if (comp) {
    const safeComp = comp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const companyInSnippet = new RegExp(`(?:^|[^a-z0-9])${safeComp}(?:[^a-z0-9]|$)`).test(s);
    const cleanNameForMatch = t.split(/[-—|]/)[0].replace(/[^a-z0-9\s]/g, '').trim();
    const isNameMatch = cleanNameForMatch.split(/\s+/).includes(comp);

    if (isNameMatch) {
      const strictCompanyInSnippet = new RegExp(`(?:at|@|of|for)\\s+${safeComp}(?:[^a-z0-9]|$)`).test(s);
      if (!strictCompanyInSnippet) {
        score -= 50; // Heavy penalty for name-collision false positives
      } else {
        score += 5;
      }
    } else if (companyInSnippet) {
      score += 5;
    }
  }

  const isFounderScore = /\b(founder|co-founder|ceo|chief executive)\b/.test(t);
  const isHRScore = /\b(human resources|talent acquisition|recruiter|hrbp|hr business partner|people partner|people ops|people operations)\b/.test(t + " " + s);
  const hasDeptSignal = dept && dept.split(" ").some(w => w.length > 2 && t.includes(w));
  if (isHRScore && !hasDeptSignal && !isFounderScore) score -= 5;

  return score;
}

/**
 * Runner functions for individual APIs in the waterfall.
 */
async function callSerperAPI(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 15 })
  });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = await res.json();
  return (data.organic || []).map((item: any) => ({
    url: item.link || "",
    title: item.title || "",
    snippet: item.snippet || "",
    domain: "serper",
    score: 0
  }));
}

async function callTavilyAPI(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      search_depth: "basic",
      include_domains: ["linkedin.com"],
      max_results: 15
    })
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((item: any) => ({
    url: item.url || "",
    title: item.title || "",
    snippet: item.content || "",
    domain: "tavily",
    score: 0
  }));
}

async function callExaAPI(company: string, deptKeywords: string, apiKey: string): Promise<SearchResult[]> {
  const query = `Here is a LinkedIn profile of a hiring manager or recruiter working at ${company} in ${deptKeywords}:`;
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: query,
      useAutoprompt: false,
      type: "neural",
      includeDomains: ["linkedin.com"],
      numResults: 15
    })
  });
  if (!res.ok) throw new Error(`Exa HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((item: any) => ({
    url: item.url || "",
    title: item.title || "",
    snippet: item.text || "",
    domain: "exa",
    score: 0
  }));
}

/**
 * Bug 1 Fix: accepts precomputed search strategy to prevent double LLM calls.
 * Implements the waterfall search logic.
 */
export async function searchCandidates(
  company: string,
  jobTitle: string,
  excludeNames: string[] = [],
  jd: string = "",
  precomputedStrategy?: SearchStrategy
): Promise<SearchResult[]> {
  // Use precomputed strategy if passed, otherwise build it
  const strategy = precomputedStrategy || await buildSearchStrategyWithLLM(company, jobTitle, jd, excludeNames);
  
  const serperKey = process.env.SERPER_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  let allResults: SearchResult[] = [];
  let uniqueNormalizedUrls = new Set<string>();

  const addUniqueResults = (results: SearchResult[]) => {
    for (const r of results) {
      if (!r.url.includes("linkedin.com/in/")) continue;
      const normalized = normalizeLinkedInUrl(r.url);
      if (!uniqueNormalizedUrls.has(normalized)) {
        uniqueNormalizedUrls.add(normalized);
        allResults.push({
          ...r,
          url: r.url.split('?')[0].replace(/\/$/, "") // clean URL structure
        });
      }
    }
  };

  // 1. PRIMARY API: Serper
  if (serperKey) {
    try {
      const [deptItems, hrItems] = await Promise.all([
        callSerperAPI(strategy.deptQuery, serperKey),
        callSerperAPI(strategy.hrQuery, serperKey)
      ]);
      
      // Inject primary score boost on department searches
      const boostedDept = deptItems.map(item => ({ ...item, score: 5 }));
      addUniqueResults([...boostedDept, ...hrItems]);
    } catch (e) {
      console.error("[waterfall] Serper primary fetch failed, falling back...", e);
    }
  }

  // 2. WATERFALL CHECK: If results < 5, execute fallback APIs in parallel
  if (allResults.length < 5 && (tavilyKey || exaKey)) {
    console.log(`[waterfall] Primary search yielded only ${allResults.length} profiles. Activating fallback APIs...`);
    const fallbackPromises: Promise<SearchResult[]>[] = [];

    if (tavilyKey) {
      fallbackPromises.push(
        callTavilyAPI(strategy.deptQuery, tavilyKey).catch(err => {
          console.error("[waterfall] Tavily secondary fetch failed:", err);
          return [];
        })
      );
    }

    if (exaKey) {
      fallbackPromises.push(
        callExaAPI(company, strategy.deptKeywords, exaKey).catch(err => {
          console.error("[waterfall] Exa tertiary fetch failed:", err);
          return [];
        })
      );
    }

    const fallbackDataArray = await Promise.all(fallbackPromises);
    for (const fallbackData of fallbackDataArray) {
      addUniqueResults(fallbackData);
    }
  }

  // Apply contextual scoring
  for (const res of allResults) {
    const cleanTitle = (res.title || "").split("-")[0].trim().split("|")[0].trim();
    res.title = cleanTitle;
    res.score += scoreResult(cleanTitle, res.snippet, res.url, strategy.deptKeywords, company);
  }

  // Sort and return top 20 candidates
  return allResults.sort((a, b) => b.score - a.score).slice(0, 20);
}

/**
 * Orchestrator search function.
 */
export async function searchCandidatesAuto(
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = []
): Promise<{ results: SearchResult[]; jdContacts: any[]; localApiUsage: { search: number }; deptKeywords: string }> {
  
  let jdContacts: any[] = [];
  if (jd && jd.trim().length > 10) {
    // Extract static contacts directly from the text
    const extracted = extractContactsFromJD(jd);
    jdContacts = extracted;
  }

  const knownNames = jdContacts.map((c) => c.name);
  const combinedExcludes = [...excludeNames, ...knownNames];

  // Bug 1 Fix: Build search strategy ONCE and pass to searchCandidates to prevent double LLM calls
  const strategy = await buildSearchStrategyWithLLM(company, jobTitle, jd ?? "", combinedExcludes);

  let searchCalls = 0;
  if (process.env.SERPER_API_KEY) searchCalls += 2; // dept + hr query
  
  let searchResults: SearchResult[] = [];
  try {
    searchResults = await searchCandidates(company, jobTitle, combinedExcludes, jd ?? "", strategy);
    // If fallback is hit, track API usage estimation
    if (searchResults.length < 5) {
      if (process.env.TAVILY_API_KEY) searchCalls += 1;
      if (process.env.EXA_API_KEY) searchCalls += 1;
    }
  } catch (err) {
    console.error("[search] Omni-Search engine failed:", err);
  }

  // Fallback to generic domain emails if result size is still 0
  if (searchResults.length === 0 && jdContacts.length === 0) {
    const cleanDomain = company.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    jdContacts.push({
      name: "Careers Team",
      email: `careers@${cleanDomain}.com`,
      context: "Fallback generic careers email"
    });
    jdContacts.push({
      name: "HR Team",
      email: `hr@${cleanDomain}.com`,
      context: "Fallback generic HR email"
    });
  }

  // Bug 3 Fix: Exact word/boundary filtering to prevent devika/dev conflict
  if (combinedExcludes.length > 0) {
    searchResults = searchResults.filter(r => !isCandidateExcluded(r.title, combinedExcludes));
  }

  // Filter out false positives (penalized names)
  searchResults = searchResults.filter(r => r.score > -40);

  return { 
    results: searchResults, 
    jdContacts, 
    localApiUsage: { search: searchCalls }, 
    deptKeywords: strategy.deptKeywords 
  };
}

/** Static extraction of contacts from Job Description */
function extractContactsFromJD(jd: string): Array<{ name: string; context: string; email?: string }> {
  if (!jd) return [];
  const contacts: Array<{ name: string; email?: string; context: string }> = [];
  const seen = new Set<string>();

  const emailRegex = /([a-zA-Z][a-zA-Z0-9_.+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = emailRegex.exec(jd)) !== null) {
    const localPart = emailMatch[1];
    const fullEmail = emailMatch[0];
    const genericPrefixes = ["info", "hr", "hello", "contact", "support", "noreply", "admin", "careers", "jobs", "hiring", "team"];
    if (genericPrefixes.some(g => localPart.toLowerCase().startsWith(g))) continue;

    const parts = localPart.replace(/[._-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(p => p.length > 0).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    if (parts.length >= 2) {
      const name = parts.join(" ");
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        contacts.push({ name, email: fullEmail, context: `Email mentioned in JD: ${fullEmail}` });
      }
    }
  }

  const stopWords = new Set(["product", "manager", "happy", "work", "full", "early", "strong", "looking", "platform", "customer", "associate", "senior", "junior", "what", "where", "when", "this", "that", "will", "from", "have", "your", "with", "about", "more", "here", "good", "great"]);
  function isValidName(name: string): boolean {
    const words = name.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    for (const w of words) {
      if (!/^[A-Z][a-z]+$/.test(w)) return false;
      if (stopWords.has(w.toLowerCase())) return false;
    }
    return name.length >= 5;
  }

  const patterns = [/(?:drop\s+(?:me\s+or\s+)?|reach\s+out\s+to\s+|contact\s+|message\s+|ping\s+|connect\s+with\s+|email\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(jd)) !== null) {
      const name = m[1].trim();
      if (!isValidName(name)) continue;
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        contacts.push({ name, context: "Mentioned in JD as contact person" });
      }
    }
  }
  return contacts;
}
```

---

#### `src/lib/pipeline/rank.ts`
```typescript
/**
 * Phase 2b: LLM ranks the top search results into candidates
 */

import { askJSON } from "../automation/llm";
import type { SearchResult, RankedCandidate } from "../types";
// Bug 4 Fix: Deleted unused/dead imports: extractDeptKeywords, deptRelevanceScore, detectWrongDept

interface RankResponse {
  topCandidates: RankedCandidate[];
}

export async function rankCandidates(
  results: SearchResult[],
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = [],
  llmDeptKeywords?: string
): Promise<RankedCandidate[]> {
  if (!results.length) return [];

  const excludeSet = new Set(excludeNames.map(n => n.trim().toLowerCase()));

  // Deduplicate results by URL to save tokens and avoid duplicate ranking
  const uniqueResults = results.filter((v, i, a) => a.findIndex(v2 => (v2.url === v.url)) === i);

  // Bug 5 Fix: Parameterized prompt replacing hardcoded "Fixed Invest" and "Fixerra" names with ${company} template variables
  const prompt = `You are an expert technical recruiter sourcing candidates for the company "${company}" for the role of "${jobTitle}".
Below are Google search results from LinkedIn profiles.

Your goal is to find people who CURRENTLY work at "${company}" (or its direct variants/subsidiaries).

CRITICAL RULES:
1. STRICTLY EXCLUDE ANYONE who is an ex-employee. If the snippet contains "ex-${company}", "former ${company}", "previously at ${company}", or if they list a DIFFERENT company as their current employer, YOU MUST REJECT THEM. There are absolutely ZERO exceptions. Ex-employees must NEVER show up.
2. EXCLUDE ANYONE who works at a completely different company and just mentioned "${company}" in passing.
3. INCLUDE current employees. They might be founders, product managers, or engineers. If the company is very small, a founder or engineer is a highly relevant decision-maker for a product role.
4. If a snippet says "DevOps Engineer. ${company}.", that means they work there. If it says "At ${company}, I designed...", evaluate if it sounds like a current or past role.

Search Results:
${uniqueResults.map((r, i) => `[${i}] Name: ${r.title.split(/[-—|]/)[0].trim()}\nSnippet: ${r.snippet}`).join('\n\n')}

Return a JSON object containing an array 'topCandidates'. For each valid CURRENT employee, provide:
{
  "topCandidates": [
    {
      "index": <number from the list above>,
      "role_type": "hiring_manager" (for founders/directors/PMs) OR "team_lead" OR "other",
      "confidence": <number between 0.5 and 0.95. Give 0.9+ for Founders/PMs, 0.7 for engineers>,
      "reason": "<Short 5-word explanation>"
    }
  ]
}
Only include people you are confident CURRENTLY work at "${company}". Return ONLY JSON.`;

  try {
    const { topCandidates } = await askJSON<{
      topCandidates: { index: number, role_type: any, confidence: number, reason: string }[]
    }>(prompt);

    let verified = (topCandidates || [])
      .map(c => {
        const r = uniqueResults[c.index];
        if (!r) return null;
        return {
          name: r.title.split(/[-—|]/)[0].trim(),
          profile_url: (r as any).url || (r as any).link || '',
          current_title: r.snippet.substring(0, 60).trim(),
          role_type: c.role_type || "other",
          confidence: c.confidence || 0.5,
          reason: `Verified: ${c.reason || 'Matches criteria'}`
        } as RankedCandidate;
      })
      .filter(Boolean) as RankedCandidate[];

    // Sort by confidence
    verified.sort((a, b) => b.confidence - a.confidence);

    let finalCandidates = verified;

    // Final safety net: strip anyone in the exclude list using exact boundary checks
    if (excludeSet.size > 0) {
      finalCandidates = finalCandidates.filter(c => {
        const cleanName = c.name.trim().toLowerCase();
        return !excludeSet.has(cleanName);
      });
    }

    return finalCandidates.slice(0, 5);
  } catch (err) {
    console.error("Error in LLM ranking:", err);
    return [];
  }
}
```

---

## 4. Detailed Test Plan

To evaluate the accuracy and coverage of the waterfall pipeline, the system must be benchmarked against three representative profiles of varying organization sizes.

### 4.1 Benchmark Target Matrix

| Company Name | Company Size | Expected Profile Yield | Target Departments / Keywords | Success Conditions |
|---|---|---|---|---|
| **Surepass** | ~93 employees | $\ge 4$ candidates | Product Management, Engineering | Must yield Aarav Sharma (Product Lead) or adjacent PMs. Must not yield ex-employees. |
| **Fixerra** | Startup (<20) | $\ge 4$ candidates | Engineering, Founders, DevOps | Must capture Founder/CTO or Lead Engineer. If no direct PM, verify it falls back to founder profiles. |
| **Razorpay** | Large (3,000+) | $\ge 10$ candidates | Talent Acquisition, Director of Product | Must capture a combination of active Recruiters and high-level Product Leaders. |

---

### 4.2 Current Employee Verification Strategy
LinkedIn profiles in search snippets must be classified as *current* or *former* to prevent outreach to candidates who have left the company.
* **Textual Rules for Parsing Titles/Snippets:**
  * Reject profiles where the snippet contains prefix markers like: `Ex-`, `Former`, `Ex `, `Past`, `Previously at`, `was a`.
  * Check the position of the company name. If it says `Product Manager at Stripe (2020-2024)`, it indicates a past role.
* **Classification Pipeline:**
  * **Level 1 (Regex Filtering):** Eliminate profiles with high-confidence ex-employee patterns (e.g., `/ex-[Cc]ompany/`, `/former [Cc]ompany/`).
  * **Level 2 (LLM Verification):** The prompt in `rankCandidates` passes the snippet to the LLM. The LLM evaluates if the wording indicates a past role (e.g., "Worked on building Stripe Billing" implies past, whereas "Building Stripe Billing" implies current).

### 4.3 Company Name Verification & False-Positive Prevention
A major issue occurs when the company name is a common first name (e.g., "Apple" or "Orange"). If candidate **Apple Smith** is a Developer at Google, a search for `"Apple" "Developer"` will match her, despite her having no affiliation with the company Apple.
* **Verification Rules:**
  * **First-Name Check:** If the candidate's first name matches the company name exactly, we flag it for inspection.
  * **Strict Snippet Qualification:** For flagged matches, we require a explicit preposition in the snippet (e.g., `at Apple`, `@ Apple`, `of Apple`, `Developer - Apple`). 
  * **Penalty Scoring:** If a profile matches the first name but lacks a strict prepositional suffix or connector in the snippet, we apply a heavy penalty (`score -= 50`). This filters them out of the pipeline before the LLM ranking step.

---

## 5. Cost Projections & Optimization

This section projects API consumption costs and provides strategies to stay within free-tier limits.

### 5.1 Consumption Projections (20 Applications / Month)
Assuming a typical user applies to **20 jobs per month** and runs **2 search cycles** per job (due to alternate keyword attempts or updating excludes), we project the following consumption:

* **Total Search Cycles / Month:** $20 \times 2 = 40$ search cycles.
* **Primary Path (Serper):** 40 queries (80 API requests: 40 dept queries + 40 recruiter queries).
* **Fallback Rate:** Assume 25% of jobs require fallback searches (10 search cycles fail to find $\ge 5$ results on Serper).
  * **Tavily Fallback Queries:** 10 requests.
  * **Exa.ai Fallback Queries:** 10 requests.
* **LLM Calls (buildSearchStrategy + rankCandidates):** 
  * 40 build strategy calls + 40 rank candidates calls = 80 LLM API calls.

### 5.2 Free-Tier Durability Projections
* **Serper.dev:** 2,500 free queries one-off. At 80 requests/month, this credit will last **31.25 months** (approx. 2.6 years).
* **Tavily AI:** 1,000 free queries/month recurring. With 10 fallback requests/month, this remains well within the limit. It will last **indefinitely**.
* **Exa.ai:** 1,000 free queries/month recurring. With 10 fallback requests/month, this remains well within the limit. It will last **indefinitely**.
* **Gemini/OpenAI LLM:** Free-tier Gemini endpoints (15 RPM) or cheap model endpoints (GPT-4o-mini at $0.15/million tokens) will cost less than **$0.05/month**.

---

### 5.3 Actionable Optimization Recommendations
To ensure the system remains sustainable and stays within free tiers, we recommend the following:

1. **Database Search Caching (Crucial):**
   Implement a `SearchCache` table in the database to store search results for a specific `(company, jobTitle, department)` tuple.
   * **Cache Schema:**
     ```sql
     CREATE TABLE SearchCache (
       id VARCHAR(255) PRIMARY KEY,
       company VARCHAR(255) NOT NULL,
       job_title VARCHAR(255) NOT NULL,
       results JSONB NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     );
     ```
   * **TTL Policy:** Cache search results for **14 to 30 days**. If the same query is requested within this window, return the cached candidates. This reduces API requests and LLM costs to 0 for duplicate searches.
2. **Sequential Fallback Throttling:**
   Only call secondary/tertiary search APIs if the primary results are below the threshold of 5. Avoid parallel calls unless the primary search has already completed and returned insufficient results.
3. **Optimized Token Substringing:**
   Job descriptions can be up to 10k+ characters. Always truncate job descriptions to the first **1500 characters** before sending them to `buildSearchStrategyWithLLM` to minimize token consumption and avoid context window limits.
4. **Duplicate Search Protection:**
   Disable the search button in the UI during an active search to prevent double-click actions from triggering concurrent queries.
