
import { config } from "dotenv";
config({ path: ".env.local" });
import { searchCandidatesAuto } from "./src/lib/pipeline/search.js";
import { rankCandidates } from "./src/lib/pipeline/rank.js";

async function main() {
  try {
    const res = await searchCandidatesAuto("Presolv360", "Product Intern", "", []);
    console.log("Running rankCandidates with fixed prompt...");
    const ranked = await rankCandidates(res.results, "Presolv360", "Product Intern", "", [], res.deptKeywords);
    
    console.log("Ranked Results Count:", ranked.length);
    ranked.forEach(r => console.log(`- ${r.name} | ${r.role_type} | ${r.reason}`));
  } catch(e) {
    console.error(e);
  }
}
main();
