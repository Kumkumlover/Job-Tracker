import * as cheerio from "cheerio";
import type { SearchResult } from "../types";

export async function searchDuckDuckGo(company: string, jobTitle: string): Promise<SearchResult[]> {
  const query = `site:linkedin.com/in "${company}" ("product manager" OR "product lead" OR "head of product" OR "senior product" OR "director of product" OR "product owner" OR "recruiter" OR "human resources")`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo error: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  $(".result").each((_, el) => {
    const title = $(el).find(".result__title").text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();
    let link = $(el).find(".result__url").attr("href") || "";
    if (link.startsWith("//")) link = "https:" + link;

    // Filter to LinkedIn candidate URLs
    if (!link.includes("linkedin.com/in/")) return;
    
    // Clean URL
    const urlParts = link.split("linkedin.com/in/");
    if (urlParts.length !== 2) return;
    const cleanUrl = "https://www.linkedin.com/in/" + urlParts[1].split(/[?#]/)[0].replace(/\/$/, "");

    if (seen.has(cleanUrl)) return;
    seen.add(cleanUrl);

    let score = 0;
    const t = title.toLowerCase();
    const s = snippet.toLowerCase();
    
    const keywords = ["manager", "lead", "head", "senior", "director", "vp", "chief", "recruiter", "talent", "hr", "human resources", "product"];
    for (const k of keywords) {
      if (t.includes(k)) score += 2;
      if (s.includes(k)) score += 1;
    }
    
    if (t.includes(company.toLowerCase())) score += 3;

    results.push({
      url: cleanUrl,
      title: title.replace(/ - LinkedIn$/, "").replace(/ \| LinkedIn$/, ""),
      snippet,
      domain: "linkedin.com",
      score,
    });
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 8);
}
