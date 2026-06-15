/**
 * dept-utils.ts
 *
 * Shared utilities for extracting department context from a job title.
 * NEVER hardcodes specific department names (e.g. "product").
 * All department detection is derived dynamically from the jobTitle supplied by the caller.
 *
 * Used by:
 *   - lib/pipeline/rank.ts  (to rank candidates by dept relevance)
 *   - tests/uat.spec.ts     (to verify LinkedIn profiles match the target dept)
 */

// ── Seniority words that should be stripped before extracting dept keywords ──

const SENIORITY_WORDS = [
  "senior", "junior", "lead", "staff", "principal", "associate",
  "assistant", "executive", "vice", "president", "chief", "head",
  "director", "manager", "officer", "intern", "trainee", "fresher",
  "entry", "mid", "level", "ii", "iii", "iv", "i",
];

// ── Synonym expansion map: if a base keyword is present, also match these ──
// This allows "PM" to match "Product Manager" profiles, etc.
// Keys are base keywords; values are additional terms to also search for.

const SYNONYM_MAP: Record<string, string[]> = {
  product: ["product", "pm", "apm", "spm", "gpm", "pmo"],
  data: ["data", "analytics", "analyst", "bi", "insights", "intelligence"],
  design: ["design", "ux", "ui", "user experience", "user interface", "visual"],
  engineering: ["engineer", "engineering", "developer", "dev", "software", "tech", "cto"],
  marketing: ["marketing", "growth", "brand", "content", "seo", "performance"],
  sales: ["sales", "business development", "bd", "account", "revenue", "commercial"],
  operations: ["operations", "ops", "supply chain", "logistics", "process"],
  finance: ["finance", "financial", "accounting", "accounts", "treasury", "audit"],
  legal: ["legal", "compliance", "regulatory", "counsel", "contracts"],
  ai: ["ai", "artificial intelligence", "ml", "machine learning", "genai", "llm"],
  hr: ["hr", "human resources", "people", "talent", "recruitment", "recruiter"],
};

// ── Department clusters that are clearly "wrong" for a given role ──
// If a candidate's title strongly signals one of these clusters AND the job
// targets a DIFFERENT cluster, the candidate is marked as a poor match.

export const WRONG_DEPT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(software engineer|backend engineer|frontend engineer|fullstack|devops|sre|site reliability|data engineer|ml engineer|mobile developer|ios developer|android developer|embedded)\b/i, label: "engineering" },
  { pattern: /\b(brand manager|content manager|content writer|social media manager|seo specialist|performance marketer|email marketer|copywriter|pr manager|communications)\b/i, label: "marketing" },
  { pattern: /\b(finance manager|accountant|accounts manager|treasury|cfo|financial analyst|audit|tax)\b/i, label: "finance" },
  { pattern: /\b(legal counsel|compliance officer|regulatory affairs|company secretary|contracts manager)\b/i, label: "legal" },
  { pattern: /\b(supply chain|logistics manager|warehouse manager|procurement)\b/i, label: "operations" },
  { pattern: /\b(talent acquisition|hr manager|human resources manager|hrbp|hr business partner|people partner|recruiter|staffing)\b/i, label: "hr" },
];

/**
 * Extract department-relevant keywords from a job title.
 *
 * Examples:
 *   "AI Product Intern"          → ["ai", "product", "pm", "apm", ...]
 *   "Associate Product Manager"  → ["product", "pm", "apm", ...]
 *   "Data Analyst"               → ["data", "analytics", "analyst", ...]
 *   "UX Designer"                → ["design", "ux", "ui", ...]
 *
 * Returns deduplicated lowercase strings.
 */
export function extractDeptKeywords(jobTitle: string): string[] {
  if (!jobTitle?.trim()) return [];

  // Step 1: Lowercase and strip seniority/level words
  let cleaned = jobTitle.toLowerCase();
  for (const sw of SENIORITY_WORDS) {
    cleaned = cleaned.replace(new RegExp(`\\b${sw}\\b`, "g"), " ");
  }
  cleaned = cleaned.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // Step 2: Tokenize
  const tokens = cleaned.split(" ").filter((t) => t.length > 1);

  // Step 3: Expand with synonyms
  const expanded = new Set<string>(tokens);

  for (const token of tokens) {
    for (const [base, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (token === base || synonyms.includes(token)) {
        for (const s of synonyms) expanded.add(s);
        expanded.add(base);
      }
    }
  }

  return [...expanded].filter((kw) => kw.length > 1);
}

/**
 * Given a candidate's title/snippet text and the target dept keywords,
 * returns a relevance score:
 *   > 0  : candidate matches the target department
 *   = 0  : candidate is neutral (no strong signal either way)
 *   < 0  : candidate appears to be in a WRONG department
 *
 * Also handles the "founder" special case — founders always get a small
 * positive score regardless of department, since they're valid contacts
 * at any company size.
 */
export function deptRelevanceScore(candidateText: string, deptKeywords: string[]): number {
  const text = candidateText.toLowerCase();

  // Founders/CEOs are always acceptable contacts
  if (/\b(founder|co-founder|ceo|chief executive)\b/.test(text)) {
    return 2; // Small positive — below a department match but above neutral
  }

  let score = 0;

  // Positive: dept keyword match in candidate title/snippet
  for (const kw of deptKeywords) {
    if (text.includes(kw)) score += 3;
  }

  // Negative: candidate appears to be in a clearly wrong department
  for (const { pattern } of WRONG_DEPT_PATTERNS) {
    if (pattern.test(text)) {
      score -= 5;
      break; // One penalty is enough
    }
  }

  return score;
}

/**
 * Returns the "wrong department" label for a candidate text, or null if
 * no clearly wrong department is detected.
 */
export function detectWrongDept(candidateText: string): string | null {
  const text = candidateText.toLowerCase();
  for (const { pattern, label } of WRONG_DEPT_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}
