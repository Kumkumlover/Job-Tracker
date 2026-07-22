import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SERPER_KEY = process.env.SERPER_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";

async function serperSearch(query: string): Promise<any[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!res.ok) { console.error("Serper error:", res.status); return []; }
  const data = await res.json();
  return (data.organic || []).filter((r: any) => r.link?.includes("linkedin.com/in/"));
}

const openings = [
  { company: "Cashify", role: "Product Intern", department: "Product" },
  { company: "Loop Health", role: "Associate Product Manager", department: "Product" },
  { company: "Shiprocket", role: "Product Manager", department: "Product" },
];

async function main() {
  for (const opening of openings) {
    console.log(`\n=== ${opening.company.toUpperCase()} ===`);
    const query = `site:linkedin.com/in "${opening.company}" ("Head of Product" OR "VP of Product" OR "Director of Product" OR "Product Manager" OR "Founder")`;
    console.log(`Query: ${query}`);
    const raw = await serperSearch(query);
    console.log(`Found ${raw.length} LinkedIn results:`);
    raw.forEach((r: any, i: number) => {
      console.log(`\n  [${i+1}] Title: ${r.title}`);
      console.log(`       URL: ${r.link}`);
      console.log(`       Snippet: ${r.snippet}`);
    });
  }
}

main().catch(console.error);
