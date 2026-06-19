/**
 * Phase 2b: LLM ranks the top search results into candidates
 *
 * Replaces 2 n8n nodes: Rank candidates + Parse LLM output
 */

import { askJSON } from "../automation/llm";
import type { SearchResult, RankedCandidate } from "../types";
import { extractDeptKeywords, deptRelevanceScore, detectWrongDept } from "./dept-utils";

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
  const uniqueResults = results.filter((v,i,a)=>a.findIndex(v2=>(v2.url===v.url))===i);

  const prompt = `You are an expert technical recruiter sourcing candidates for the company "${company}" for the role of "${jobTitle}".
Below are Google search results from LinkedIn profiles.

Your goal is to find people who CURRENTLY work at ${company} (or its direct variants like Fixed Invest).

CRITICAL RULES:
1. EXCLUDE ANYONE who is an ex-employee (e.g. "ex-Fixerra", "former PM at Fixerra", "past: Fixerra").
2. EXCLUDE ANYONE who works at a completely different company and just mentioned ${company} in passing.
3. INCLUDE current employees. They might be founders, product managers, or engineers. If the company is very small, a founder or engineer is a highly relevant decision-maker for a product role.
4. If a snippet says "DevOps Engineer. Fixerra.", that means they work there. If it says "At Fixerra, I designed...", evaluate if it sounds like a current or past role.

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
Only include people you are confident CURRENTLY work at ${company}. Return ONLY JSON.`;

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

    // Final safety net: strip anyone in the exclude list
    if (excludeSet.size > 0) {
      finalCandidates = finalCandidates.filter(c => !excludeSet.has(c.name.trim().toLowerCase()));
    }

    return finalCandidates.slice(0, 5);
  } catch (err) {
    console.error("Error in LLM ranking:", err);
    return [];
  }
}
