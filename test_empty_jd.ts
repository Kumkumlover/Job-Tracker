import { config } from "dotenv";
config({ path: ".env.local" });
import { searchCandidatesAuto } from "./src/lib/pipeline/search.js";
import { rankCandidates } from "./src/lib/pipeline/rank.js";

async function main() {
  console.log("=== STARTING EMPTY JD TEST (EXACT VERCEL REPRODUCTION) ===");
  const company = "Liveswitch";
  const jobTitle = "Product Manager";
  const jd = ""; // Blank JD just like on Vercel UI when user doesn't paste one
  
  console.log(`1. Searching for: Company="${company}", Role="${jobTitle}", JD=""...`);
  const { results: rawResults, jdContacts, deptKeywords, companyContext } = await searchCandidatesAuto(company, jobTitle, jd, []);
  
  console.log(`\n2. Raw Search Results Found: ${rawResults.length}`);
  if (rawResults.length > 0) {
    console.log("Sample raw result:", rawResults[0].title, "-", rawResults[0].url);
  }
  
  console.log("\n3. Ranking candidates with LLM...");
  const ranked = rawResults.length 
    ? await rankCandidates(rawResults, company, jobTitle, jd, [], deptKeywords, companyContext)
    : [];
    
  console.log(`\n4. Ranked Candidates Count: ${ranked.length}`);
  console.log(JSON.stringify(ranked, null, 2));
  console.log("=== END OF TEST ===");
}

main().catch(console.error);
