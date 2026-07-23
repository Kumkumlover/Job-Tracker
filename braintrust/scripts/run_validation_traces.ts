import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SERPER_KEY = process.env.SERPER_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";

interface Candidate {
  name: string;
  title: string;
  url: string;
  snippet: string;
  sources: string[];
}

async function serperSearch(query: string): Promise<Candidate[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.organic || [])
    .filter((r: any) => r.link?.includes("linkedin.com/in/"))
    .map((r: any) => ({
      name: r.title?.split(" - ")[0]?.split(" | ")[0]?.trim() || r.title,
      title: r.title,
      url: r.link,
      snippet: r.snippet || "",
      sources: ["serper"],
    }));
}

async function rankWithLLM(company: string, jobTitle: string, department: string, candidates: Candidate[]): Promise<any[]> {
  const candidateList = candidates.map((c, i) =>
    `[${i}] Name: ${c.name}\n    Google Title: ${c.title}\n    URL: ${c.url}\n    Snippet: ${c.snippet}`
  ).join("\n\n");

  const prompt = `You are filtering LinkedIn search results for a job opening at "${company}" for role "${jobTitle}".

REJECTION RULES (HARD RULES - only reject if CLEARLY true):
1. REJECT if the snippet explicitly says "Ex-${company}", "Former ${company}", "ex @${company}", "Left ${company}", or lists a DIFFERENT company as their obvious CURRENT employer (e.g. "Product Manager at Google | Ex-${company}").
2. REJECT if they are in a totally unrelated department like Sales, HR, Finance, or Engineering when we need Product.
3. DO NOT reject just because the snippet is vague or doesn't explicitly say "current" — most LinkedIn snippets don't.
4. When in doubt, INCLUDE the candidate with lower confidence (0.5). It is better to include a false positive than miss a real person.

Candidates:
${candidateList}

Return JSON: { "topCandidates": [ { "index": <n>, "name": "<name>", "current_title": "<their title>", "linkedin_url": "<url>", "confidence": <0.4-0.95>, "role_type": "hiring_manager|team_lead|other", "reasoning": "<10 words>" } ] }
Include everyone who passes the rules above. Return ONLY JSON.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`LLM error ${res.status}:`, errText);
    return [];
  }
  const data = await res.json();
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return parsed.topCandidates || [];
  } catch (e) {
    console.error("LLM parse error:", data.choices?.[0]?.message?.content);
    return [];
  }
}

const openings = [
  { company: "IDFC First Bank", role: "Assistant Product Manager", department: "Product" },
  { company: "PocketFM", role: "AI Product Intern", department: "Product" },
  { company: "Cashify", role: "Product Intern", department: "Product" },
  { company: "Loop Health", role: "Associate Product Manager", department: "Product" },
  { company: "Shiprocket", role: "Product Manager", department: "Product" },
];

const results: any[] = [];

async function main() {
  console.log("=== STEP 3: LIVE CANDIDATE SEARCH & VALIDATION ===\n");

  for (const opening of openings) {
    console.log(`\n=== ${opening.company.toUpperCase()} | ${opening.role} ===`);

    // Query 1: Hiring manager search
    const hmQuery = `site:linkedin.com/in "${opening.company}" ("Head of Product" OR "VP of Product" OR "Director of Product" OR "Product Manager" OR "Founder" OR "Co-Founder")`;
    // Query 2: HR/Recruiter search
    const hrQuery = `site:linkedin.com/in "${opening.company}" ("Recruiter" OR "Talent Acquisition" OR "HR Business Partner" OR "People Partner")`;

    console.log(`Searching: ${hmQuery}`);
    const [hmResults, hrResults] = await Promise.all([
      serperSearch(hmQuery),
      serperSearch(hrQuery),
    ]);

    // Deduplicate by URL
    const seen = new Map<string, Candidate>();
    for (const c of [...hmResults, ...hrResults]) {
      const key = c.url.split("?")[0].toLowerCase().replace(/\/$/, "");
      if (!seen.has(key)) seen.set(key, c);
      else seen.get(key)!.sources.push(...c.sources);
    }
    const allCandidates = Array.from(seen.values());
    console.log(`Found ${allCandidates.length} raw candidates`);

    // LLM Validation — cap at 12 to avoid context overflow on smaller models
    const validated = await rankWithLLM(opening.company, opening.role, opening.department, allCandidates.slice(0, 12));
    console.log(`Validated ${validated.length} candidates after LLM filter`);

    // Print results
    validated.forEach((c: any, i: number) => {
      console.log(`\n  [${i + 1}] ${c.name}`);
      console.log(`       Title: ${c.current_title}`);
      console.log(`       Role Type: ${c.role_type}`);
      console.log(`       Confidence: ${(c.confidence * 100).toFixed(0)}%`);
      console.log(`       URL: ${c.linkedin_url}`);
      console.log(`       Reason: ${c.reasoning}`);
    });

    results.push({ opening, rawCount: allCandidates.length, validated });
  }

  // Save results to JSON for reference
  fs.writeFileSync(
    path.join(process.cwd(), "braintrust/step3_results.json"),
    JSON.stringify(results, null, 2),
    "utf-8"
  );

  console.log("\n\n=== SUMMARY ===");
  results.forEach(r => {
    console.log(`${r.opening.company}: ${r.rawCount} raw → ${r.validated.length} validated candidates`);
  });
  console.log("\nFull results saved to braintrust/step3_results.json");
}

main().catch(console.error);
