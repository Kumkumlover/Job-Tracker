
import { config } from "dotenv";
config({ path: ".env.local" });
import { searchCandidatesAuto } from "./src/lib/pipeline/search.js";
import { rankCandidates } from "./src/lib/pipeline/rank.js";

const JD = `🚀 We're Hiring: Product Intern
📍 Colaba, Mumbai | 🏢 Full-time - Work from Office

Passionate about building impactful products? 

Join Presolv360 as a Product Intern and gain hands-on experience in product management by working closely with cross-functional teams on product research, user insights, and feature planning.

We're looking for someone with:
• Basic understanding of Product Management & Agile
• Familiarity with Jira, Google Analytics, Mixpanel, etc.
• Strong analytical and problem-solving skills
• Excellent communication

If this aligns with your background, or you know someone relevant, feel free to connect or drop an email at chahal.shah@presolv360.com.`;

async function main() {
  console.log("=== TRACE START ===");
  console.log("1. Input Company: Presolv360, Job Title: Product Intern");
  
  const { results: rawResults, jdContacts, deptKeywords } = await searchCandidatesAuto("Presolv360", "Product Intern", JD, []);
  
  console.log("\n2. JD Extraction:");
  console.log(JSON.stringify(jdContacts, null, 2));
  
  console.log(`\n3. Raw Search Results Found: ${rawResults.length}`);
  
  const ranked = rawResults.length 
    ? await rankCandidates(rawResults, "Presolv360", "Product Intern", JD, [], deptKeywords)
    : [];
    
  console.log("\n4. LLM Ranked Candidates:");
  console.log(JSON.stringify(ranked, null, 2));
  console.log("=== TRACE END ===");
}

main();
