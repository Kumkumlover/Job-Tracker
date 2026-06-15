/**
 * Email Intelligence Engine — Full TypeScript port of the Python FastAPI backend.
 *
 * Combines:
 *   1. Hunter.io / Apollo.io API lookups (capped at 2 per domain)
 *   2. LLM-powered domain guessing and pattern prediction
 *   3. Pattern-based prediction with domain-specific learning
 *   4. DNS-based validation (real, not simulated)
 *   5. Caching and feedback loops
 *
 * Storage uses an in-memory store backed by a JSON file on disk.
 * On Vercel serverless the file won't persist between cold starts,
 * but the in-memory cache survives within a single invocation.
 */

import { validateEmail } from "../pipeline/validate";
import { generatePermutations } from "./permutator";
import { resolveMxSafe } from "./dns-utils";
import { store, type PatternRecord, type CachedEmail } from "./intelligence-store";
import { ask, askJSON } from "./llm";

// ─── Public Types ───────────────────────────────────────────────

export interface PersonInput {
  name: string;
  company: string;
  domain?: string;
  email?: string;
}

export interface EmailResult {
  email: string;
  type: "verified" | "discovered" | "predicted";
  confidence: number;
  source: string;
}

export interface PersonResult {
  name: string;
  company: string;
  domain: string;
  emails: EmailResult[];
  recommended: string | null;
}

// ─── Name Parser ────────────────────────────────────────────────

function parseName(fullName: string): { first: string; last: string; initial: string } {
  const clean = fullName.replace(/[^a-zA-Z\s\-]/g, "").trim().toLowerCase();
  const parts = clean.split(/\s+/);
  if (parts.length === 0) return { first: "", last: "", initial: "" };

  const first = parts[0] ?? "";
  const initial = first[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";

  return { first, last, initial };
}

// ─── Pattern Engine ─────────────────────────────────────────────

const DEFAULT_PATTERNS = [
  "{first}.{last}",
  "{first}{last}",
  "{first}",
  "{f}{last}",
  "{first}{l}",
  "{last}.{first}",
];

/** Reverse-engineer which pattern was used for an email's local part */
function extractPattern(first: string, last: string, localPart: string): string {
  if (!first) return "unknown";
  if (localPart === first) return "{first}";
  if (localPart === `${first}.${last}`) return "{first}.{last}";
  if (localPart === `${first}${last}`) return "{first}{last}";
  if (first.length > 0 && localPart === `${first[0]}${last}`) return "{f}{last}";
  if (last.length > 0 && localPart === `${first}${last[0]}`) return "{first}{l}";
  if (localPart === `${last}.${first}`) return "{last}.{first}";
  return "unknown";
}

/** Generate an email from a pattern template */
function generateFromPattern(
  first: string,
  last: string,
  pattern: string,
  domain: string
): string | null {
  if (!first) return null;

  let local = "";
  switch (pattern) {
    case "{first}":
      local = first;
      break;
    case "{first}.{last}":
      if (!last) return null;
      local = `${first}.${last}`;
      break;
    case "{first}{last}":
      if (!last) return null;
      local = `${first}${last}`;
      break;
    case "{f}{last}":
      if (!last) return null;
      local = `${first[0]}${last}`;
      break;
    case "{first}{l}":
      if (!last) return null;
      local = `${first}${last[0]}`;
      break;
    case "{last}.{first}":
      if (!last) return null;
      local = `${last}.${first}`;
      break;
    default:
      return null;
  }

  return local ? `${local}@${domain}` : null;
}

import { prisma, getDefaultUserId } from "../prisma";

/** Get the best patterns for a domain, ranked by success rate */
async function getTopPatterns(domain: string, limit: number = 3): Promise<PatternRecord[]> {
  const userId = await getDefaultUserId();

  // Collect domain-specific and global patterns from DB
  const domainPatterns = await prisma.patternRecord.findMany({
    where: { userId, domain }
  });
  const globalPatterns = await prisma.patternRecord.findMany({
    where: { userId, domain: null }
  });

  // Merge: domain-specific patterns take priority
  const merged: PatternRecord[] = [];
  const seen = new Set<string>();

  // Domain-specific first, sorted by success rate
  for (const p of domainPatterns.sort(
    (a, b) =>
      b.successCount / Math.max(b.usageCount, 1) -
      a.successCount / Math.max(a.usageCount, 1)
  )) {
    if (!seen.has(p.pattern)) {
      seen.add(p.pattern);
      merged.push({ pattern: p.pattern, domain: p.domain, successCount: p.successCount, usageCount: p.usageCount });
    }
  }

  // Then global patterns
  for (const p of globalPatterns.sort(
    (a, b) =>
      b.successCount / Math.max(b.usageCount, 1) -
      a.successCount / Math.max(a.usageCount, 1)
  )) {
    if (!seen.has(p.pattern)) {
      seen.add(p.pattern);
      merged.push({ pattern: p.pattern, domain: p.domain, successCount: p.successCount, usageCount: p.usageCount });
    }
  }

  // Fill the rest with defaults if we haven't reached the limit
  for (const p of DEFAULT_PATTERNS) {
    if (merged.length >= limit) break;
    if (!seen.has(p)) {
      seen.add(p);
      merged.push({
        pattern: p,
        domain: null,
        successCount: 1,
        usageCount: 2,
      });
    }
  }

  return merged.slice(0, limit);
}

// ─── LLM Intelligence Layer ─────────────────────────────────────

/**
 * Use LLM to guess the email domains a company uses.
 * Companies often use abbreviations (e.g., "Digital Harbor" → dharbor.com).
 */
async function llmGuessDomains(company: string, knownDomain: string): Promise<string[]> {
  try {
    const prompt = `You are an email domain expert. Given a company name, predict the email domains their employees likely use.

Company: "${company}"
Known domain: ${knownDomain}

Many companies use shorter abbreviations for emails (e.g., "Digital Harbor" uses "dharbor.com", "McKinsey & Company" uses "mckinsey.com").

Return a JSON array of up to 3 likely email domains, ordered by probability.
Include the known domain if it seems correct.
Return ONLY the JSON array, no explanation. Example: ["dharbor.com", "digitalharbor.com"]`;

    const domains = await askJSON<string[]>(prompt);
    return domains.filter((d: string) => d.includes(".") && d.length > 3);
  } catch {
    return [knownDomain];
  }
}

/**
 * Use LLM to predict the most likely email pattern for a company,
 * incorporating feedback history from similar companies.
 */
async function llmPredictPattern(
  company: string,
  domain: string
): Promise<string | null> {
  try {
    const userId = await getDefaultUserId();
    // Gather feedback history for context
    const allPatterns = await prisma.patternRecord.findMany({
      where: { userId, usageCount: { gt: 0 } }
    });
    const feedbackSummary = allPatterns
      .map(p => {
        const rate = p.successCount / Math.max(p.usageCount, 1);
        const scope = p.domain ? `domain:${p.domain}` : "global";
        return `${p.pattern} (${scope}, ${Math.round(rate * 100)}% success, ${p.usageCount} uses)`;
      })
      .join("\n");

    const prompt = `You are an email pattern prediction engine. Based on historical data, predict the most likely email format for employees at "${company}" (domain: ${domain}).

HISTORICAL PATTERN DATA:
${feedbackSummary || "No historical data yet."}

Common patterns: {first}.{last}, {first}{last}, {first}, {f}{last}, {first}{l}, {last}.{first}

Based on:
1. The company name and domain style
2. Historical success rates from similar domains
3. Industry conventions

Return ONLY the pattern string (e.g., "{first}.{last}"). No explanation.`;

    const raw = await ask(prompt);
    const cleaned = raw.trim().replace(/^["']+|["']+$/g, "");

    // Validate it's a known pattern
    if (DEFAULT_PATTERNS.includes(cleaned)) return cleaned;
    return null;
  } catch {
    return null;
  }
}

/**
 * Use LLM to perform a deep knowledge search for a specific person's email.
 * This checks if the model already knows the verified email from its training data.
 */
async function llmDeepEmailSearch(name: string, company: string, domain: string): Promise<string | null> {
  try {
    const prompt = `You are an expert web researcher. Perform a deep knowledge retrieval for the public work email address of "${name}" at the company "${company}" (domain: ${domain}).
    
If you are absolutely certain of their real, verified email address based on your training data (e.g., from their public LinkedIn, GitHub, or company website), return ONLY the email address.
If you are not absolutely certain, or if it's just a guess, return exactly: NOT_FOUND

Do NOT guess. Do NOT return multiple emails. Return ONLY the email address or NOT_FOUND.`;

    const raw = await ask(prompt);
    const cleaned = raw.trim().toLowerCase();
    
    if (cleaned === "not_found" || !cleaned.includes("@")) {
      return null;
    }
    
    // Quick validation that it matches the domain
    if (cleaned.endsWith(`@${domain}`)) {
      return cleaned;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── API Layer (Hunter.io + Apollo.io) ──────────────────────────

async function hunterLookup(
  domain: string,
  firstName: string,
  lastName: string,
  apiKey: string
): Promise<{ email: string; source: string } | null> {
  if (!apiKey) {
    console.warn(`[Hunter] Skipped for ${domain} — no API key provided.`);
    return null;
  }

  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: apiKey,
    });

    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    console.log(`[Hunter] lookup for ${firstName} ${lastName} @ ${domain}: status ${res.status}`);
    
    if (!res.ok) {
      console.warn(`[Hunter] Error response: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Hunter] response: ${JSON.stringify(data).substring(0, 150)}`);
    if (!data?.data?.email) return null;

    return { email: data.data.email, source: "Hunter.io" };
  } catch (error) {
    console.error(`[Hunter] Exception for ${domain}:`, error);
    return null;
  }
}

async function apolloLookup(
  name: string,
  company: string,
  domain: string,
  apiKey: string
): Promise<{ email: string; source: string } | null> {
  if (!apiKey) {
    console.warn(`[Apollo] Skipped for ${name} @ ${domain} — no API key provided.`);
    return null;
  }

  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Api-Key": apiKey
      },
      body: JSON.stringify({
        api_key: apiKey,
        name,
        organization_name: company,
        domain,
      }),
    });

    console.log(`[Apollo] lookup for ${name} @ ${domain}: status ${res.status}`);

    if (!res.ok) {
      console.warn(`[Apollo] Error response for ${name}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Apollo] response for ${name}: ${JSON.stringify(data?.person?.email ?? 'no email').substring(0, 100)}`);
    if (!data?.person?.email) return null;

    return { email: data.person.email, source: "Apollo.io" };
  } catch (err) {
    console.error(`[Apollo] Exception for ${name} @ ${domain}:`, err);
    return null;
  }
}

// ─── Public Web Search ────────────────────────────────────────────

/** Scrape DuckDuckGo for publicly available emails (e.g. LinkedIn bios) */
async function searchPublicEmail(name: string, company: string, domain: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`"${name}" "${company}" "@${domain}"`);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const regex = new RegExp(`[a-zA-Z0-9._%+-]+@${domain.replace(/\./g, '\\.')}`, 'gi');
    const matches = html.match(regex);
    if (matches && matches.length > 0) {
      return matches[0].toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main Intelligence Engine ───────────────────────────────────

function extractDomain(input: string): string {
  if (!input) return "";
  try {
    let raw = input.toLowerCase().trim();
    if (!raw.startsWith("http")) raw = "https://" + raw;
    const url = new URL(raw);
    let hostname = url.hostname;
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);
    return hostname;
  } catch {
    return input.toLowerCase().trim();
  }
}

async function processPerson(
  person: PersonInput,
  hunterKey: string,
  apolloKey: string,
  preFetchedResults?: Map<string, any>,
  localApiUsage: { hunter: number; apollo: number } = { hunter: 0, apollo: 0 },
  localApiTrack?: Map<string, number>
): Promise<PersonResult> {
  const { first, last } = parseName(person.name);
  let domain = extractDomain(person.domain ?? "");

  if (!domain) {
    const guesses = await llmGuessDomains(person.company, "");
    if (guesses.length > 0) {
      domain = guesses[0];
    } else {
      return formatOutput({ ...person, domain: "Unknown" }, []);
    }
  }

  // Ensure the person object reflects the resolved domain
  const resolvedPerson = { ...person, domain };
  console.log(`processPerson: ${person.name} | company: ${person.company} | resolved domain: ${domain}`);

  // 1. Check cache first
  const cached = await store.getCachedEmails(resolvedPerson.name, domain);
  const hasVerified = cached.some((c) => c.verified);
  
  // Calculate API calls from the database instead of in-memory to survive serverless restarts!
  const allDomainEmails = await store.getCachedEmailsByDomain(domain);
  const apiCalls = allDomainEmails.filter(c => c.source === "Hunter.io" || c.source === "Apollo.io").length;

  // If we already have verified emails, or we maxed out API limits for this domain, return cache immediately
  if (cached.length > 0 && (hasVerified || apiCalls >= 2)) {
    return formatOutput(
      resolvedPerson,
      cached.map((c) => ({
        email: c.email,
        type: (c.verified
          ? "verified"
          : c.source === "Pattern Engine"
            ? "predicted"
            : "discovered") as "verified" | "discovered" | "predicted",
        confidence: c.confidence,
        source: c.source,
      }))
    );
  }

  const results: EmailResult[] = [];

  // Find how many distinct people have verified emails for this domain
  const verifiedCount = new Set(allDomainEmails.filter(c => c.verified).map(c => c.name)).size;

  // 1.5 Pattern Engine Fast-Path (0 Credits)
  // ONLY use this shortcut if we have 2+ verified emails that came from REAL APIs (Hunter/Apollo)
  // NOT just from JD extraction or LLM guesses — those don't verify the domain pattern reliably.
  const topPatterns = await getTopPatterns(domain, 5);
  let fastPathFound = false;
  
  const apiVerifiedCount = new Set(
    allDomainEmails
      .filter(c => c.verified && (c.source === "Hunter.io" || c.source === "Apollo.io" || c.source === "Public Web Search"))
      .map(c => c.name)
  ).size;

  if (topPatterns.length > 0 && apiVerifiedCount >= 2) {
    const bestPattern = topPatterns[0];
    if (bestPattern.usageCount > 0 && (bestPattern.successCount / bestPattern.usageCount) >= 0.90) {
      const allPerms = generatePermutations(first, last, domain);
      const matchedPerm = allPerms.find(p => p.pattern === bestPattern.pattern);
      
      if (matchedPerm) {
        console.log(`[email-finder] Fast-path for ${person.name}: ${matchedPerm.email} (pattern ${bestPattern.pattern}, ${apiVerifiedCount} API-verified emails on domain)`);
        await store.saveEmail(matchedPerm.email, resolvedPerson.name, domain, matchedPerm.pattern, 0.99, "Pattern Engine", false);
        await store.recordPatternSuccess(matchedPerm.pattern, domain);
        
        return formatOutput(resolvedPerson, [
          { email: matchedPerm.email, type: "predicted", confidence: 0.99, source: "Pattern Engine" }
        ]);
      }
    }
  }

  // Reserve API quota synchronously to prevent race conditions in Promise.all
  let canCallApi = false;
  if (localApiTrack) {
    const current = localApiTrack.get(domain) || 0;
    if (apiCalls + current < 2) {
      canCallApi = true;
      localApiTrack.set(domain, current + 1);
    }
  } else {
    canCallApi = apiCalls < 2;
  }

  // 2. API Lookups (max 2 per domain)
  if (domain && hunterKey && canCallApi) {
    // Check prefetched
    const prefetched = preFetchedResults?.get(`${resolvedPerson.name}-${domain}`);
    if (prefetched) {
      const pattern = extractPattern(first, last, prefetched.email.split("@")[0]);
      await store.saveEmail(prefetched.email, resolvedPerson.name, domain, pattern, 0.95, prefetched.source, true);
      await store.recordPatternSuccess(pattern, domain);
      
      return formatOutput(resolvedPerson, [
        { email: prefetched.email, type: "verified", confidence: 0.95, source: prefetched.source },
      ]);
    }

    localApiUsage.hunter++;
    const hunterData = await hunterLookup(domain, first, last, hunterKey);

    if (hunterData) {
      const pattern = extractPattern(first, last, hunterData.email.split("@")[0]);
      await store.saveEmail(hunterData.email, resolvedPerson.name, domain, pattern, 0.95, hunterData.source, true);
      await store.recordPatternSuccess(pattern, domain);

      return formatOutput(resolvedPerson, [
        { email: hunterData.email, type: "verified", confidence: 0.95, source: hunterData.source },
      ]);
    }
  }

  if (canCallApi && apolloKey) {
    // Try Apollo
    localApiUsage.apollo++;
    const apolloResult = await apolloLookup(resolvedPerson.name, resolvedPerson.company, domain, apolloKey);
    if (apolloResult) {
      const pattern = extractPattern(first, last, apolloResult.email.split("@")[0]);
      await store.saveEmail(apolloResult.email, resolvedPerson.name, domain, pattern, 0.85, apolloResult.source, false);
      await store.recordPatternSuccess(pattern, domain);

      return formatOutput(resolvedPerson, [
        { email: apolloResult.email, type: "discovered", confidence: 0.85, source: apolloResult.source },
      ]);
    }
  }

  // 3. Public Web Search (Free, Slow fallback)
  const publicEmail = await searchPublicEmail(resolvedPerson.name, resolvedPerson.company, domain);
  if (publicEmail) {
    const pattern = extractPattern(first, last, publicEmail.split("@")[0]);
    await store.saveEmail(publicEmail, resolvedPerson.name, domain, pattern, 0.90, "Public Web Search", true);
    await store.recordPatternSuccess(pattern, domain);

    return formatOutput(resolvedPerson, [
      { email: publicEmail, type: "verified", confidence: 0.90, source: "Public Web Search" },
    ]);
  }

  // Deep LLM Knowledge Search removed to prevent hallucinations.
  // We fall through directly to the Pattern Engine.


  // If API lookups failed but we had cached predictions, return them now to avoid regenerating
  if (cached.length > 0) {
    return formatOutput(
      resolvedPerson,
      cached.map((c) => ({
        email: c.email,
        type: (c.verified
          ? "verified"
          : c.source === "Pattern Engine"
            ? "predicted"
            : "discovered") as "verified" | "discovered" | "predicted",
        confidence: c.confidence,
        source: c.source,
      }))
    );
  }

  // 4. Self-Training Permutation Engine
  // If no API results are found, we generate all permutations and score them based on past successes.
  if (results.length === 0) {
    const allPerms = generatePermutations(first, last, domain);
    const topPatterns = await getTopPatterns(domain, 30);
    
    // Create a scoring map from the top patterns
    const patternScores = new Map<string, number>();
    for (const p of topPatterns) {
      // Base rate maxed at 0.95 for perfect historical match, default to 0.3 for unknown
      const baseRate = Math.max(p.successCount / Math.max(p.usageCount, 1), 0.3);
      const score = Math.min(0.95, Math.round(baseRate * 100) / 100);
      patternScores.set(p.pattern, score);
    }

    const scoredPerms = allPerms.map(perm => ({
      ...perm,
      score: patternScores.get(perm.pattern) || 0.2 // 0.2 for completely unknown permutations
    }));

    // Sort by historical score descending
    scoredPerms.sort((a, b) => b.score - a.score);

    // Skip strict DNS validation to prevent 504 timeouts!
    // Just return the top 4 most likely permutations based on historical/global patterns.
    const topGuesses = scoredPerms.slice(0, 4);
    
    for (const guess of topGuesses) {
      if (results.some((r) => r.email === guess.email)) continue;
      
      results.push({ 
        email: guess.email, 
        type: "predicted", 
        confidence: guess.score, 
        source: "Pattern Engine" 
      });
      
      // Save them as predicted, not verified
      await store.saveEmail(guess.email, resolvedPerson.name, domain, guess.pattern, guess.score, "Pattern Engine", false);
    }
  }

  return formatOutput(person, results);
}

/** Format output with recommended email */
function formatOutput(person: PersonInput, emails: EmailResult[]): PersonResult {
  // Sort by confidence descending
  emails.sort((a, b) => b.confidence - a.confidence);

  // Determine recommendation: prefer verified > discovered > highest predicted
  let recommended: string | null = null;
  if (emails.length > 0) {
    const typePriority: Record<string, number> = { verified: 3, discovered: 2, predicted: 1 };
    const sorted = [...emails].sort((a, b) => {
      const pDiff = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
      if (pDiff !== 0) return pDiff;
      return b.confidence - a.confidence;
    });
    recommended = sorted[0].email;
  }

  return {
    name: person.name,
    company: person.company,
    domain: person.domain || "",
    emails,
    recommended,
  };
}

// ─── Public API ─────────────────────────────────────────────────

/** Enrich a list of people sequentially (to respect API rate limits) */
export async function enrichAll(
  people: PersonInput[],
  hunterKey: string,
  apolloKey: string
): Promise<{ results: PersonResult[]; localApiUsage: { hunter: number; apollo: number } }> {
  const results: PersonResult[] = [];
  const preFetchedResults = new Map<string, any>();
  const localApiUsage = { hunter: 0, apollo: 0 };

  // 1. Group people by company
  const companyGroups = new Map<string, PersonInput[]>();
  for (const p of people) {
    const comp = (p.company || "").trim().toLowerCase();
    if (!comp) continue; // Skip grouping if no company
    if (!companyGroups.has(comp)) companyGroups.set(comp, []);
    companyGroups.get(comp)!.push(p);
  }

  // 2. Resolve domain for each company ONCE
  for (const [comp, group] of companyGroups.entries()) {
    // Check if any person in this group already has a domain provided or an email
    let sharedDomain = "";
    for (const p of group) {
      let extracted = extractDomain(p.domain ?? "");
      if (!extracted && p.email) {
        extracted = extractDomain(p.email.split("@")[1] || "");
      }
      if (extracted) {
        sharedDomain = extracted;
        break;
      }
    }

    // If no one has a domain, guess it ONCE for the entire company
    if (!sharedDomain && group.length > 0 && group[0].company) {
      const guesses = await llmGuessDomains(group[0].company, "");
      
      let verifiedDomain = "";
      
      // To avoid Vercel's 10s timeout, test all guesses concurrently on just ONE candidate
      const testCandidate = group.find(p => !p.email);
      
      if (testCandidate && guesses.length > 0) {
        const fName = testCandidate.name.split(" ")[0] || "";
        const lName = testCandidate.name.split(" ").slice(1).join(" ") || "";
        
        if (fName && lName) {
          // Limit to max 3 guesses to avoid Hunter rate limits
          const topGuesses = guesses.slice(0, 3);
          
          for (const guess of topGuesses) {
            localApiUsage.hunter++;
            const result = await hunterLookup(guess, fName, lName, hunterKey);
            if (result) {
              verifiedDomain = guess;
              preFetchedResults.set(`${testCandidate.name}-${verifiedDomain}`, result);
              break;
            }
          }
        }
      }

      if (verifiedDomain) {
        sharedDomain = verifiedDomain;
      } else if (guesses.length > 0) {
        // If Hunter failed, don't blindly pick guesses[0]. Verify MX records!
        let validFallback = "";
        for (const guess of guesses) {
          const mx = await resolveMxSafe(guess);
          if (mx && mx.length > 0) {
            validFallback = guess;
            break;
          }
        }
        sharedDomain = validFallback || guesses[0];
      }
    }

    // Assign the shared domain to all people in the group who don't have one
    if (sharedDomain) {
      for (const p of group) {
        if (!extractDomain(p.domain ?? "")) {
          p.domain = sharedDomain;
        }
        
        // --- JD Extraction Pattern Feedback Loop ---
        // If they already have an email (from JD), feed it into the Pattern Engine!
        if (p.email) {
          const { first, last } = parseName(p.name);
          const localPart = p.email.split("@")[0].toLowerCase();
          const pattern = extractPattern(first, last, localPart);
          
          // Save it to the database so the Pattern Engine can use it for others
          await store.saveEmail(
            p.email,
            p.name,
            sharedDomain,
            pattern,
            100, // max confidence
            "JD Extraction",
            true // verified
          );
          if (pattern !== "unknown") {
            await store.recordPatternSuccess(pattern, sharedDomain);
          }
        }
      }
    }
  }

  // 3. Process each person
  // We process CONCURRENTLY to avoid Vercel 60s timeouts. 
  // `localApiTrack` is used to enforce the 2 API calls/domain limit across concurrent promises.
  const localApiTrack = new Map<string, number>();

  const processPromises = people.map(async (person) => {
    if (person.email) {
      return {
        name: person.name,
        company: person.company,
        domain: person.domain || "",
        emails: [{ email: person.email, source: "JD Extraction", confidence: 100, type: "verified" } as EmailResult],
        recommended: person.email,
      };
    }
    return await processPerson(person, hunterKey, apolloKey, preFetchedResults, localApiUsage, localApiTrack);
  });

  results.push(...(await Promise.all(processPromises)));

  return { results, localApiUsage };
}

export { type PersonInput as PersonInputType };
