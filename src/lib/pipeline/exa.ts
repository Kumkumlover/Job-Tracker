/**
 * Exa.ai Neural Search integration for the consensus search engine.
 * Uses semantic completion prompts (neural mode) — finds profiles by meaning,
 * not keyword matching. Best for handling typos, alternate company name spellings,
 * and role variations that Serper/Tavily keyword searches miss.
 */
import type { SearchResult } from "../types";

export async function searchExa(
  company: string,
  deptKeywords: string,
  jobTitle: string
): Promise<SearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[exa] EXA_API_KEY not configured. Skipping.");
    return [];
  }

  const isJuniorRole = jobTitle.toLowerCase().includes("intern") || jobTitle.toLowerCase().includes("junior");
  const targetRole = isJuniorRole ? "hiring manager or team lead" : `${jobTitle} or hiring manager`;
  
  // Neural/semantic prompt — Exa works best with sentence completions,
  // not boolean queries. The prompt describes what the result should look like.
  const query = `Here is the LinkedIn profile of a ${targetRole} who currently works at the specific company exactly named "${company}" in the ${deptKeywords} department:`;

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        useAutoprompt: false, // We craft our own semantic prompt
        type: "neural",
        includeDomains: ["linkedin.com"],
        numResults: 15,
        contents: {
          text: { maxCharacters: 500 },
        },
      }),
      signal: AbortSignal.timeout(5000), // 5s hard timeout
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[exa] HTTP ${res.status}:`, body.slice(0, 200));
      return [];
    }

    const data = await res.json();
    return (data.results || [])
      .filter((r: any) => (r.url || "").includes("linkedin.com/in/"))
      .map((r: any) => ({
        url: r.url || "",
        title: r.title || "",
        snippet: r.text || "",
        domain: "linkedin.com",
        score: 0,
        source: "exa" as const,
      }));
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      console.warn("[exa] Request timed out after 5s");
    } else {
      console.error("[exa] Search failed:", err);
    }
    return [];
  }
}
