
/**
 * Phase 2b: LLM ranks the top search results into candidates.
 *
 * Corroboration metadata (which search engines found each profile) is now passed
 * to the LLM so it can factor multi-source confirmation into its confidence scoring.
 */

import type { SearchResult, RankedCandidate } from "../types";
import type { CorroboratedResult } from "./search";

export async function rankCandidates(
  results: SearchResult[],
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = [],
  llmDeptKeywords?: string,
  webCompanyContext: string = ""
): Promise<RankedCandidate[]> {
  if (!results.length) return [];

  const excludeSet = new Set(excludeNames.map((n) => n.trim().toLowerCase()));

  // Deduplicate by URL
  const uniqueResults = results.filter(
    (v, i, a) => a.findIndex((v2) => v2.url === v.url) === i
  );

  // Build corroboration labels for the LLM
  const getCorroborationLabel = (r: SearchResult): string => {
    const sources = (r as CorroboratedResult).sources;
    if (!sources || sources.length === 0) return "";
    if (sources.length === 3) return " [CONFIRMED by ALL 3 search engines — very high trust]";
    if (sources.length === 2) return ` [CONFIRMED by 2 search engines: ${sources.join(", ")} — high trust]`;
    return ` [Found by 1 engine only: ${sources[0]} — lower trust]`;
  };

  const { loadPrompt } = await import("../automation/prompts/index");
  const { TopCandidatesResponseSchema } = await import("../evalArtifacts");
  const { askJSONValidated } = await import("../automation/llm");

  const jdContext = jd ? `\nCOMPANY CONTEXT (from Job Description):\n${jd.substring(0, 1000)}\n` : "";
  const webContext = webCompanyContext ? `\nCOMPANY CONTEXT (from Web Search):\n${webCompanyContext}\n` : "";
  
  const finalContext = `${jdContext}${webContext}\nCRITICAL: Use the above context (especially location, industry, or product details) to differentiate between companies that share the exact same name. If the snippet shows a person working at an "${company}" that does not match this context (e.g., wrong industry or wrong location), EXCLUDE THEM.\n`;

  const searchResults = uniqueResults.map((r, i) => `[${i}] Name: ${r.title.split(/[-—|]/)[0].trim()}${getCorroborationLabel(r)}\nSnippet: ${r.snippet}`).join("\n\n");

  const prompt = loadPrompt("candidateRank_v1", {
    company,
    jobTitle,
    companyContext: finalContext,
    llmDeptKeywords: llmDeptKeywords || jobTitle,
    searchResults
  });

  try {
    const { topCandidates } = await askJSONValidated(prompt, TopCandidatesResponseSchema);

    let verified = (topCandidates || [])
      .map((c) => {
        const r = uniqueResults[c.index];
        if (!r) return null;
        
        const t = (r.title || "").toLowerCase();
        const s = (r.snippet || "").toLowerCase();
        const combinedText = t + " " + s;
        const isCLevel = /\b(founder|co-founder|ceo|chief|cro|cmo|cfo|coo|vp|president)\b/.test(combinedText);
        const hasDept = llmDeptKeywords.toLowerCase().split(" ").some(w => w.length > 2 && combinedText.includes(w));
        
        let role = c.role_type || "other";
        // Override the LLM if it hallucinates an unrelated executive as the hiring manager
        if (isCLevel && !hasDept && role === "hiring_manager") {
          role = "other";
        }

        return {
          name: r.title.split(/[-—|]/)[0].trim(),
          profile_url: (r as any).url || (r as any).link || "",
          current_title: r.snippet.substring(0, 60).trim(),
          role_type: role,
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
