/**
 * Tavily AI Search integration for the consensus search engine.
 * Uses natural language queries with include_domains targeting linkedin.com.
 * Tavily excels at extracting clean, structured content from live web pages.
 */
import type { SearchResult } from "../types";

export async function searchTavily(
  company: string,
  deptKeywords: string,
  roleVariants: string[]
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("[tavily] TAVILY_API_KEY not configured. Skipping.");
    return [];
  }

  // Natural language query — Tavily's strength is understanding intent, not boolean operators
  const topRoles = roleVariants.slice(0, 3).join(", ");
  const query = `${topRoles} currently working at ${company} ${deptKeywords} LinkedIn profile`;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_domains: ["linkedin.com"],
        max_results: 15,
      }),
      signal: AbortSignal.timeout(5000), // 5s hard timeout
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[tavily] HTTP ${res.status}:`, body.slice(0, 200));
      return [];
    }

    const data = await res.json();
    return (data.results || [])
      .filter((r: any) => (r.url || "").includes("linkedin.com/in/"))
      .map((r: any) => ({
        url: r.url || "",
        title: (r.title || "").split("-")[0].trim().split("|")[0].trim(),
        snippet: r.content || "",
        domain: "linkedin.com",
        score: 0,
        source: "tavily" as const,
      }));
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      console.warn("[tavily] Request timed out after 5s");
    } else {
      console.error("[tavily] Search failed:", err);
    }
    return [];
  }
}
