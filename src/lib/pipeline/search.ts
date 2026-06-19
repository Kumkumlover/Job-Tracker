import type { SearchResult } from "../types";
import { askJSON } from "../automation/llm";
import { search as ddgSearch } from "duck-duck-scrape";
import * as cheerio from "cheerio";

/** 
 * Extract department/domain keywords from a job title.
 * KEEPS specific domain words, only strips pure seniority/level words.
 */
function extractDepartmentKeywords(jobTitle: string): string {
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
 * LLM-driven search strategy.
 * Sends the full JD to the LLM and asks it to reason about:
 *   1. Which team/department this role actually belongs to
 *   2. What seniority/role titles would be the relevant hiring managers
 *   3. A concrete LinkedIn search query for Serper
 *
 * Falls back to heuristic buildQueriesFallback() if the LLM call fails or no JD is provided.
 */
interface LLMSearchStrategy {
  department: string;
  roleVariants: string[];
  deptKeywords: string;
}

async function buildSearchStrategyWithLLM(
  company: string,
  jobTitle: string,
  jd: string,
  excludeNames: string[] = []
): Promise<{ deptQuery: string; hrQuery: string; deptKeywords: string }> {
  
  // If no JD is provided, fall straight to heuristic
  if (!jd?.trim()) {
    return buildQueriesFallback(company, jobTitle, excludeNames);
  }

  try {
    const prompt = `You are an expert Recruiting & OSINT Intelligence Engine.
Your task is to analyze a Job Description and identify the exact LinkedIn titles of the Hiring Managers and HR personnel for this role.

CONTEXT:
Job Title: "${jobTitle}"
Company: "${company}"

EDGE CASES & VARIABLES TO CONSIDER:
1. Company Size / Stage:
   - If this looks like an early-stage startup, the hiring manager is often the "Founder", "Co-Founder", or "CEO".
   - If it's a mid-size or enterprise company, the hiring manager will be "Manager", "Director", "VP", or "Head of". DO NOT include "Founder" for large enterprises.
2. Title Specificity (The "AI Product" problem):
   - Some companies use hyper-specific titles (e.g. "Head of AI Product").
   - Many companies use generic structural titles (e.g. just "Product Manager" or "VP Product").
   - You MUST include BOTH the specific niche variations AND the broad functional variations.
3. Search Engine Limits:
   - We will use your output to build a Google site:linkedin.com query.
   - Google has a strict 32-word limit. Keep role variants concise (1-3 words max).

YOUR TASK:
Return a valid JSON object with the following schema:
{
  "department": "The specific functional team (e.g., 'Product Management', 'Engineering', 'Growth Marketing').",
  "hiringManagerTitles": [
    // Array of EXACTLY 4 to 6 concise LinkedIn job titles for the likely hiring managers.
    // Must include a mix of:
    // - Direct manager (e.g., "Director of Product")
    // - Department head (e.g., "Head of Product", "VP Product")
    // - Functional peer/lead (e.g., "Lead Product Manager")
    // - (If startup) "Founder" or "Co-Founder"
  ],
  "hrTitles": [
    // Array of 2 to 3 concise HR/Recruiter titles specifically suited for this role
    // e.g., ["Technical Recruiter", "Talent Acquisition"] for engineering, or ["Campus Recruiter"] for freshers.
  ],
  "deptKeywords": "A short 2-4 word string summarizing the core domain for internal scoring (e.g., 'AI Product', 'Frontend', 'B2B Sales')."
}

Job Description (first 1500 chars):
${jd.substring(0, 1500)}

Return ONLY the JSON. No markdown formatting, no explanations.`;

    const strategy = await askJSON<any>(prompt);

    
    if (!strategy?.hiringManagerTitles?.length) {
      throw new Error("LLM returned empty strategy");
    }

    const cleanJobTitle = jobTitle.replace(/"/g, '');
    
    // Always include heuristic fallback variants as a safety net
    const { deptQuery: fallbackQuery } = buildQueriesFallback(company, jobTitle, []);
    const fallbackMatch = fallbackQuery.match(/\((.*?)\)/);
    const fallbackVariants = fallbackMatch ? fallbackMatch[1].split(" OR ") : [];

    // Combine exact title + LLM specific variants + generic fallback variants
    const rawVariants = [`"${cleanJobTitle}"`, ...strategy.hiringManagerTitles.map((r: string) => `"${r}"`), ...fallbackVariants];
    
    // Deduplicate and filter out empties, then truncate to max 6 variants to avoid Google's 32-word query limit!
    const uniqueVariants = Array.from(new Set(rawVariants)).filter(Boolean).slice(0, 6);
    const exclusions = excludeNames.length > 0 ? excludeNames.map(n => `-"${n}"`).join(" ") : "";

    const deptQuery = `site:linkedin.com/in "${company}" (${uniqueVariants.join(" OR ")})${exclusions ? ` ${exclusions}` : ""}`;


    // HR Query
    const hrRawVariants = strategy.hrTitles && strategy.hrTitles.length > 0
      ? strategy.hrTitles.map((r: string) => `"${r}"`)
      : ['"Recruiter"', '"Talent Acquisition"', '"HR Business Partner"'];
    const hrUnique = Array.from(new Set(hrRawVariants)).slice(0, 4);

    const hrQuery = `site:linkedin.com/in "${company}" (${hrUnique.join(" OR ")}) "${strategy.department}"${exclusions ? ` ${exclusions}` : ""}`;

    console.log(`[search] LLM strategy — dept: "${strategy.department}", variants: ${strategy.hiringManagerTitles.slice(0, 3).join(", ")}`);

    return { deptQuery, hrQuery, deptKeywords: strategy.deptKeywords || strategy.department };

  } catch (err) {
    console.warn("[search] LLM strategy failed, falling back to heuristic:", err);
    return buildQueriesFallback(company, jobTitle, excludeNames);
  }
}

/** Fallback heuristic query builder — used when no JD is provided or LLM fails */
function buildQueriesFallback(
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
  const hrQuery = `site:linkedin.com/in "${company}" (Recruiter OR "Talent Acquisition" OR "HR Business Partner" OR "People Partner") "${deptKeywords}"${exclusions ? ` ${exclusions}` : ""}`;

  return { deptQuery, hrQuery, deptKeywords };
}


/**
 * Heuristic score for a LinkedIn search result.
 * Dept-specific titles score higher; pure generic HR penalised.
 */
function scoreResult(title: string, snippet: string, url: string, deptKeywords: string = "", company: string = ""): number {
  let score = 0;
  const t = title.toLowerCase();
  const s = snippet.toLowerCase();
  const dept = deptKeywords.toLowerCase();
  const comp = company.toLowerCase().trim();

  // URL quality
  if (url.includes("linkedin.com/in/")) score += 3;
  if (title.length > 0) score += 0.5;

  // Seniority/leadership signals
  const seniorityTerms = ["manager", "lead", "head", "director", "vp", "chief", "principal"];
  for (const k of seniorityTerms) {
    if (t.includes(k)) score += 2;
    if (s.includes(k)) score += 0.5;
  }

  // Department relevance bonus
  if (dept) {
    const deptWords = dept.split(" ").filter(w => w.length > 2);
    for (const dw of deptWords) {
      if (t.includes(dw)) score += 6;
      if (s.includes(dw)) score += 1;
    }
  }

  // Company Match Logic (Crucial for edge cases where company name == first name)
  if (comp) {
    const titleWords = t.split(/\s+/);
    const isFirstNameMatch = titleWords.length > 0 && titleWords[0] === comp;
    
    // Escape regex characters and enforce boundaries to avoid matching "tal" inside "digital"
    const safeComp = comp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const companyInSnippet = new RegExp(`(?:^|[^a-z0-9])${safeComp}(?:[^a-z0-9]|$)`).test(s);
    
    // If the company name matches any part of the person's name (e.g. first name or last name),
    // we can't just check if the name is in the snippet (because their name will be in the snippet!).
    // We must require strict signals.
    const cleanNameForMatch = t.split(/[-—|]/)[0].replace(/[^a-z0-9\s]/g, '').trim();
    const isNameMatch = cleanNameForMatch.split(/\s+/).includes(comp);

    if (isNameMatch) {
      const strictCompanyInSnippet = new RegExp(`(?:at|@|of|for)\\s+${safeComp}(?:[^a-z0-9]|$)`).test(s);
      if (!strictCompanyInSnippet) {
        score -= 50; // Heavy penalty to filter out false positives
      } else {
        score += 5; // Strong signal they actually work there
      }
    } else if (companyInSnippet) {
      score += 5; // Good signal: company mentioned in snippet
    }
  }

  // Penalise pure generic HR
  const isFounderScore = /\b(founder|co-founder|ceo|chief executive)\b/.test(t);
  const isHRScore = /\b(human resources|talent acquisition|recruiter|hrbp|hr business partner|people partner|people ops|people operations)\b/.test(t + " " + s);
  const hasDeptSignal = dept && dept.split(" ").some(w => w.length > 2 && t.includes(w));
  if (isHRScore && !hasDeptSignal && !isFounderScore) score -= 5;

  return score;
}



async function searchGitHubOSINT(company: string, keywords: string = ""): Promise<SearchResult[]> {
  try {
      console.log(`[GitHub OSINT] Searching for ${company}...`);
      
      const q = `${company} ${keywords}`.trim();
      const response = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(q)}+type:user`, {
          headers: {
              'User-Agent': 'Node.js-OSINT-Script'
          }
      });

      if (!response.ok) return [];

      const data = await response.json();
      const users = data.items || [];
      const results: SearchResult[] = [];

      // Only fetch details for top 5 to avoid rate limits
      for (const user of users.slice(0, 5)) {
          const userResponse = await fetch(user.url, {
              headers: { 'User-Agent': 'Node.js-OSINT-Script' }
          });

          if (userResponse.ok) {
              const userData = await userResponse.json();
              results.push({
                  title: userData.name || userData.login,
                  url: userData.html_url,
                  snippet: `GitHub Bio: ${userData.bio || ''} | Company: ${userData.company || ''}`,
                  domain: "github.com",
                  score: 4 // Baseline OSINT score
              });
          }
          await new Promise(resolve => setTimeout(resolve, 300));
      }

      return results;
  } catch (error) {
      console.error("[GitHub OSINT] Error occurred:", error);
      return [];
  }
}

export async function searchCandidates(
  company: string,
  jobTitle: string,
  excludeNames: string[] = [],
  jd: string = ""
): Promise<SearchResult[]> {
  // Use LLM to build the search strategy — reads the full JD and infers department + role targets
  const { deptQuery, hrQuery, deptKeywords } = await buildSearchStrategyWithLLM(company, jobTitle, jd, excludeNames);
  const serperKey = process.env.SERPER_API_KEY;

  console.log(`[search] deptQuery: ${deptQuery}`);
  console.log(`[search] hrQuery: ${hrQuery}`);


  if (!serperKey) {
    throw new Error("SERPER_API_KEY is not configured.");
  }

  async function runQuery(q: string, page: number = 1) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey!, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 10, page })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.organic || [];
  }

  const [deptItemsPage1, deptItemsPage2, hrItems] = await Promise.all([
    runQuery(deptQuery, 1),
    runQuery(deptQuery, 2),
    runQuery(hrQuery, 1)
  ]);
  
  const deptItems = [...deptItemsPage1, ...deptItemsPage2];

  console.log(`[search] dept results: ${deptItems.length}, hr results: ${hrItems.length}`);

  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Process dept results first (PRIORITY — scored with a +5 dept-priority bonus)
  for (const item of deptItems) {
    let link = item.link || "";
    if (!link.includes("linkedin.com/in/")) continue;
    link = link.split("?")[0].replace(/\/$/, "");
    if (seenUrls.has(link)) continue;
    seenUrls.add(link);
    let cleanTitle = (item.title || "").split("-")[0].trim().split("|")[0].trim();
    results.push({
      url: link,
      title: cleanTitle,
      snippet: item.snippet || "",
      domain: "linkedin.com",
      score: scoreResult(cleanTitle, item.snippet || "", link, deptKeywords, company) + 5 // Dept priority boost
    });
  }

  // Process HR results second (lower base priority)
  for (const item of hrItems) {
    let link = item.link || "";
    if (!link.includes("linkedin.com/in/")) continue;
    link = link.split("?")[0].replace(/\/$/, "");
    if (seenUrls.has(link)) continue; // Skip if already in dept results
    seenUrls.add(link);
    let cleanTitle = (item.title || "").split("-")[0].trim().split("|")[0].trim();
    results.push({
      url: link,
      title: cleanTitle,
      snippet: item.snippet || "",
      domain: "linkedin.com",
      score: scoreResult(cleanTitle, item.snippet || "", link, deptKeywords, company) // No priority boost for HR
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 20);
}


export function extractContactsFromJD(jd: string): Array<{ name: string; context: string; email?: string }> {
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

export async function findContactsLLMOnly(
  company: string, jobTitle: string, jd?: string, excludeNames: string[] = [], apiKey?: string
): Promise<SearchResult[]> {
  interface LLMContact { name: string; title: string; role_type: string; confidence: number; reason: string; }
  const prompt = `You are a recruiter intelligence engine. I need to find the people most likely responsible for hiring a "${jobTitle}" at "${company}".
${jd ? `Job Description: ${jd.substring(0, 500)}` : ""}
Return the top 5 most likely decision-makers (hiring managers, team leads, HR/recruiters).
Return ONLY a JSON array with: name, title, role_type, confidence (0.0-1.0), reason.`;

  try {
    const contacts = await askJSON<LLMContact[]>(prompt);
    const excludeSet = new Set((excludeNames || []).map(n => n.toLowerCase()));
    const verified = contacts.filter(c => c.name && c.name.trim() && !excludeSet.has(c.name.toLowerCase()));
    
    // Sort by confidence descending
    verified.sort((a, b) => b.confidence - a.confidence);

    // If we have strong dept matches (>0.6), exclude HR entirely — they're a last resort
    const hasDeptMatches = verified.some(c => c.confidence >= 0.85);
    let finalCandidates = verified;
    if (hasDeptMatches) {
      // Strong dept people found — exclude HR and wrong dept
      finalCandidates = verified.filter(c => c.confidence >= 0.8);
    } else {
      // No strong dept matches — keep anything above noise floor (drop only confirmed wrong dept)
      finalCandidates = verified.filter(c => c.confidence >= 0.5);
    }

    return finalCandidates.slice(0, 5).map((c, idx) => ({
      url: "", title: `${c.name} — ${c.title}`,
      snippet: `⚠️ LLM-generated (unverified): ${c.role_type}: ${c.reason} (Confidence: ${Math.round(c.confidence * 100)}%)`,
      domain: "linkedin.com", score: (finalCandidates.length - idx) * 2 + (c.confidence * 5),
    }));
  } catch (err) {
    return [];
  }
}

export async function searchCandidatesAuto(
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = []
): Promise<{ results: SearchResult[]; jdContacts: any[]; localApiUsage: { search: number }; deptKeywords: string }> {
  let jdContacts: any[] = [];
  if (jd && jd.trim().length > 10) {
    jdContacts = extractContactsFromJD(jd);
  }

  const knownNames = jdContacts.map((c) => c.name);
  const combinedExcludes = [...excludeNames, ...knownNames];

  let searchResults: SearchResult[] = [];
  let searchCalls = 0;

  const { deptKeywords } = await buildSearchStrategyWithLLM(company, jobTitle, jd ?? "", combinedExcludes);


  
  // Extract primary search keyword to pass to the OSINT engine
  let osintKeyword = "";
  const titleLower = jobTitle.toLowerCase();
  if (titleLower.includes("product") || titleLower.includes(" pm") || titleLower.includes("apm")) {
    osintKeyword = "Product";
  } else if (titleLower.includes("engineer") || titleLower.includes("developer")) {
    osintKeyword = "Engineering";
  } else if (titleLower.includes("data") || titleLower.includes("analyst")) {
    osintKeyword = "Data";
  } else if (titleLower.includes("design")) {
    osintKeyword = "Design";
  } else if (titleLower.includes("marketing")) {
    osintKeyword = "Marketing";
  } else if (titleLower.includes("sales")) {
    osintKeyword = "Sales";
  } else {
    osintKeyword = deptKeywords.split(" ")[0] || "";
  }

  const serperKey = process.env.SERPER_API_KEY ?? "";

  try {
    const searchPromises: Promise<SearchResult[]>[] = [
      searchGitHubOSINT(company, osintKeyword)
    ];

    if (serperKey) {
      searchCalls += 2;
      searchPromises.push(
        searchCandidates(company, jobTitle, combinedExcludes, jd).catch(err => {
          console.error("[search] Serper engine failed:", err);
          return [] as SearchResult[];
        })
      );
    }

    const resultsArray = await Promise.all(searchPromises);
    const githubResults = resultsArray[0] || [];
    const serperResults = resultsArray[1] || [];
    
    searchResults = [...githubResults, ...serperResults];

    // Rescore all OSINT results using our standard rubric
    for (const res of searchResults) {
      res.score += scoreResult(res.title, res.snippet, res.url, deptKeywords, company);
    }
    
    searchResults.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error("[search] Omni-Search engine failed:", err);
  }

  // Fallback to generic emails if STILL 0
  if (searchResults.length === 0) {
    console.warn(`[search] Still 0 results for ${company}. Falling back to generic careers/hr emails.`);
    const cleanDomainName = company.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    jdContacts.push({
      name: "Careers Team",
      email: `careers@${cleanDomainName}.com`,
      context: "Fallback generic careers email"
    });
    jdContacts.push({
      name: "HR Team",
      email: `hr@${cleanDomainName}.com`,
      context: "Fallback generic HR email"
    });
  }

  // Strictly filter out excludeNames locally to fix the cycling bug
  if (combinedExcludes.length > 0) {
    const excludeSet = new Set(combinedExcludes.map(n => n.trim().toLowerCase()));
    searchResults = searchResults.filter(r => {
      let name = (r.title || "").split("—")[0].split("-")[0].split("|")[0].trim().toLowerCase();
      
      // Also do a substring check just in case the title format is weird
      for (const excluded of excludeSet) {
        if (name === excluded || name.includes(excluded)) {
          return false; // Filter out
        }
      }
      return true; // Keep
    });
  }

  // Filter out false positives where the person's first name exactly matches the company name
  // and there is no strong signal they work at the company. These are penalized heavily (-50).
  searchResults = searchResults.filter(r => r.score > -40);

  // Removed findContactsLLMOnly fallback. If search yields nothing, we return empty so the user knows no real profiles were found.
  
  const uniqueUrls = new Set<string>();
  const finalResults: SearchResult[] = [];
  for (const r of searchResults) {
    if (!r.url) {
      finalResults.push(r);
      continue;
    }
    
    // Normalize URL for deduplication across different search engines
    // e.g. "https://in.linkedin.com/in/john-doe" -> "linkedin.com/in/john-doe"
    const normalizedUrl = r.url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^(www\.|[a-z]{2}\.)/, '') // strips www. or in. or uk.
      .split('?')[0]
      .replace(/\/$/, "");

    if (!uniqueUrls.has(normalizedUrl)) {
      uniqueUrls.add(normalizedUrl);
      finalResults.push(r);
    }
  }

  return { results: finalResults, jdContacts, localApiUsage: { search: searchCalls }, deptKeywords };
}
