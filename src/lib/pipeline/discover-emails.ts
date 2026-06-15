/**
 * Phase 3a: Guess email domains + generate permutations for ALL top candidates
 *
 * Replaces 3 n8n nodes: Email Guesser + Bridge + Single
 * Key improvement: tries all candidates, not just the first one
 */

import { ask } from "../automation/llm";
import type { RankedCandidate, EmailCandidate } from "../types";

/** Ask Gemini for likely email domains used by a company */
async function guessEmailDomains(company: string): Promise<string[]> {
  const prompt = `Identify the specific email domain(s) used by employees of "${company}". Many companies use shorter abbreviations for emails (e.g., "dharbor.com" instead of "digitalharbor.com"). Return up to 3 likely email domains separated by commas. Return ONLY the domains. No explanation.`;

  const raw = await ask(prompt);

  const domains = raw
    .split(/[\s,;\n]+/)
    .map((d) => d.trim().replace(/^["']+|["']+$/g, "").replace(/\.$/, ""))
    .filter((d) => d.includes(".") && d.length > 3);

  if (!domains.length) {
    // Fallback: derive from company name
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "");
    domains.push(`${slug}.com`);
  }

  return [...new Set(domains)];
}

/** Generate common email permutations for a person at given domains */
function generatePermutations(
  firstName: string,
  lastName: string,
  domains: string[]
): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const l = lastName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const emails: string[] = [];

  for (const domain of domains) {
    // Most common patterns first (so we validate the most-likely one first)
    if (l) emails.push(`${f}.${l}@${domain}`);
    if (l) emails.push(`${f}${l}@${domain}`);
    emails.push(`${f}@${domain}`);
    if (l) emails.push(`${f[0]}${l}@${domain}`);
    if (l) emails.push(`${l}.${f}@${domain}`);
    if (l) emails.push(`${f}.${l[0]}@${domain}`);
  }

  return [...new Set(emails)];
}

/**
 * Discover email candidates for ALL ranked candidates (not just #1).
 * Returns a flat list ordered: all permutations for candidate 1, then 2, then 3.
 */
export async function discoverEmails(
  candidates: RankedCandidate[],
  company: string
): Promise<EmailCandidate[]> {
  if (!candidates.length) return [];

  const domains = await guessEmailDomains(company);
  const results: EmailCandidate[] = [];

  for (const candidate of candidates) {
    const name = (candidate.name ?? "").trim();
    if (!name) continue;

    const parts = name.split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") ?? "";

    if (!firstName) continue;

    const emails = generatePermutations(firstName, lastName, domains);

    for (const email of emails) {
      results.push({
        candidate_name: name,
        profile_url: candidate.profile_url ?? null,
        email,
      });
    }
  }

  return results;
}
