import { config } from "dotenv";
config({ path: ".env.local" });
import { searchCandidatesAuto } from "../../src/lib/pipeline/search.js";
import { rankCandidates } from "../../src/lib/pipeline/rank.js";

const JD = `🚀 We're Hiring: Associate Product Manager (APM) | Bangalore (In-office)
Join GIVA, one of India's fastest-growing D2C fine jewellery brands, and help build products that power our omnichannel business.

📍 Location: Bangalore (In-office)
💼 Experience: 1–3 Years

What You'll Do:
Draft Product Requirement Documents (PRDs)
Lead User Acceptance Testing (UAT)
Manage and prioritize product backlogs
Analyze product performance using SQL, Excel & analytics tools
Troubleshoot operational issues with cross-functional teams
Work closely with Engineering, Business, Operations & Retail teams

We're Looking For:
1–3 years of experience in Product Management, Business Analysis, or Data Analysis
Strong analytical and problem-solving skills
Hands-on experience with Excel and SQL
Excellent communication and stakeholder management skills
E-commerce or Retail experience is a plus
Degree from a Tier-1 institute (IIT/NIT/BITS/IIM) preferred

If you're passionate about solving real business problems and building impactful products, we'd love to hear from you!
📩 Share your resume at nanditha@giva.co
hashtag#Apply if you are from the D2C or Ecommerce Background`;

async function main() {
  try {
    console.log("=== STEP 1: SEARCH STRATEGY ===");
    const res = await searchCandidatesAuto("GIVA", "Associate Product Manager (APM)", JD, []);
    console.log("Strategy Output:", JSON.stringify({
      company_size_inference: res.company_size_inference,
      department: res.department,
      hiringManagerTitles: res.hiringManagerTitles,
      hrTitles: res.hrTitles,
      deptKeywords: res.deptKeywords
    }, null, 2));
    
    console.log(`\n=== STEP 2: RAW SERPER RESULTS (${res.results.length}) ===`);
    res.results.forEach((r, i) => console.log(`[${i}] ${r.name} - ${r.title}`));

    console.log("\n=== STEP 3: LLM RANKING ===");
    const ranked = await rankCandidates(res.results, "GIVA", "Associate Product Manager (APM)", JD, [], res.deptKeywords);
    
    console.log("Ranked Results Count:", ranked.length);
    ranked.forEach(r => {
      console.log(`- ${r.name} | ${r.role_type} (Conf: ${r.confidence})`);
      console.log(`  Title: ${r.current_title}`);
      console.log(`  Reason: ${r.reasoning || r.reason}`);
    });
  } catch(e) {
    console.error(e);
  }
}
main();
