/**
 * Phase 2b: LLM ranks the top search results into candidates.
 *
 * Bug 4 Fix: Removed dead imports (extractDeptKeywords, deptRelevanceScore, detectWrongDept).
 * Bug 5 Fix: Replaced hardcoded "Fixed Invest" / "Fixerra" with ${company} template variable.
 *
 * Corroboration metadata (which search engines found each profile) is now passed
 * to the LLM so it can factor multi-source confirmation into its confidence scoring.
 */

import { askJSON } from "../automation/llm";
import type { SearchResult, RankedCandidate } from "../types";
import type { CorroboratedResult } from "./search";

export async function rankCandidates(
  results: SearchResult[],
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = [],
  llmDeptKeywords?: string
): Promise<RankedCandidate[]> {
  if (!results.length) return [];

  const excludeSet = new Set(excludeNames.map((n) => n.trim().toLowerCase()));

  // Deduplicate by URL
  const uniqueResults = results.filter(
    (v, i, a) => a.findIndex((v2) => v2.url === v.url) === i
  );

  // Build corroboration labels for the LLM — tell it which engines confirmed each profile
  const getCorroborationLabel = (r: SearchResult): string => {
    const sources = (r as CorroboratedResult).sources;
    if (!sources || sources.length === 0) return "";
    if (sources.length === 3) return " [CONFIRMED by ALL 3 search engines — very high trust]";
    if (sources.length === 2) return ` [CONFIRMED by 2 search engines: ${sources.join(", ")} — high trust]`;
    return ` [Found by 1 engine only: ${sources[0]} — lower trust]`;
  };

  // Bug 5 Fix: All references to specific companies replaced with ${company}
  const prompt = `You are an expert technical recruiter sourcing candidates for the company "${company}" for the role of "${jobTitle}".
${jd ? `\nCOMPANY CONTEXT (from Job Description):\n${jd.substring(0, 1000)}\n\nCRITICAL: Use the above context (especially location, industry, or product details) to differentiate between companies that share the exact same name. If the snippet shows a person working at an "${company}" that does not match this context (e.g., wrong industry or wrong location), EXCLUDE THEM.\n` : ""}
Below are LinkedIn search results. Each result indicates which search engines found it — profiles confirmed by multiple independent engines are far more likely to be current employees.

Your goal is to find people who CURRENTLY work at "${company}" (or its direct variants/subsidiaries). Focus heavily on finding people in the specific department: "${llmDeptKeywords || jobTitle}".

CRITICAL RULES:
1. STRICTLY EXCLUDE ANYONE who is an ex-employee. Look carefully at employment dates in the snippet. If the snippet contains "ex-${company}", "former ${company}", "previously at ${company}", or if they list a DIFFERENT company as their current employer, REJECT THEM. Zero exceptions.
2. EXCLUDE ANYONE who works at a subsidiary, parent company, or partner company instead of the EXACT company named "${company}".
3. STRICTLY EXCLUDE ANYONE whose current job title indicates they belong to a different department than the one we are hiring for. If we are hiring a Product role, REJECT engineers, sales, marketing, HR, and finance people. ONLY accept founders, C-level executives, and managers/leads in the specific target department.
4. If the candidate passes ALL rules, output a JSON object: { "confidence": <0-100>, "current_title": "<their current title at ${company}>", "reasoning": "<why they are a perfect fit>" }
5. If they fail ANY rule, you MUST return confidence 0.

Search Results:
${uniqueResults
  .map(
    (r, i) =>
      `[${i}] Name: ${r.title.split(/[-—|]/)[0].trim()}${getCorroborationLabel(r)}\nSnippet: ${r.snippet}`
  )
  .join("\n\n")}

Return a JSON object with array 'topCandidates'. For each valid CURRENT employee:
{
  "topCandidates": [
    {
      "index": <number from list above>,
      "role_type": "hiring_manager" | "team_lead" | "other",
      "confidence": <0.5–0.95. Give 0.95 to people whose title matches the specific target department (e.g. Product Managers). Give 0.85 to Founders/Executives. Give bonus for 2-3 engine confirmation.>,
      "reason": "<Short 5-word explanation>"
    }
  ]
}
Only include people you are confident CURRENTLY work at "${company}". Return ONLY JSON.`;

  try {
    const { topCandidates } = await askJSON<{
      topCandidates: {
        index: number;
        role_type: any;
        confidence: number;
        reason: string;
      }[];
    }>(prompt);

    let verified = (topCandidates || [])
      .map((c) => {
        const r = uniqueResults[c.index];
        if (!r) return null;
        return {
          name: r.title.split(/[-—|]/)[0].trim(),
          profile_url: (r as any).url || (r as any).link || "",
          current_title: r.snippet.substring(0, 60).trim(),
          role_type: c.role_type || "other",
          confidence: c.confidence || 0.5,
          reason: `Verified: ${c.reason || "Matches criteria"}`,
        } as RankedCandidate;
      })
      .filter(Boolean) as RankedCandidate[];

    verified.sort((a, b) => b.confidence - a.confidence);

    // Final safety net — strip anyone in the exclude list
    if (excludeSet.size > 0) {
      verified = verified.filter(
        (c) => !excludeSet.has(c.name.trim().toLowerCase())
      );
    }

    return verified.slice(0, 15);
  } catch (err) {
    console.error("[rank] LLM ranking failed:", err);
    return [];
  }
}
