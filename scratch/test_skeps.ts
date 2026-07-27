import { config } from "dotenv";
config({ path: ".env.local" });
import { searchCandidatesAuto } from "../src/lib/pipeline/search.js";
import { rankCandidates } from "../src/lib/pipeline/rank.js";

const JD = `We're Hiring: Associate Product Manager at Skeps 

📍 Gurugram | 💻 Onsite | 🕒 Full-Time

🔧 What You'll Do
Manage entire lifecycle of the product from conception to final release and ensure that it can handle the complexities of the business 
• Synthesize feedback, data, and company goals to develop a high quality and clear product roadmap. 
• Define, measure, and share critical metrics to measure the success of the product in the market. 
• Partner with design, engineering, and operations to scope and build features that solve and create new opportunities. 
• Ensure that high standards of reliability, quality, usability, and measurement are adhered to throughout each phase of product development, review, and adoption to facilitate and align a successful product /feature rollout 
• Regularly baseline and track usage and impact of the product on business and product metrics to recommend strategies to improve. 
• Partner with Leads on feature-related project priorities, milestones, and delivery dates. 


🎯 What We're Looking For
2+ years of relevant experience in building, scaling and delivering highly successful and innovative financial systems. 
• Can talk directly with customers on a regular basis and passionate about helping both sides of our marketplace 
• Ability to prioritize in an ambiguous environment. 
• Analytical and data driven in decision making. Collects whatever data is necessary to inform product direction, whether in the form of user experience or other business metrics. 
• Is self-driven with a high sense of ownership and urgency. Should have a track record of successfully delivering projects on time, to scope, with high quality. 
• Can clearly communicate product plans, benefits, and results, as appropriate, to a spectrum of audiences, from internal stakeholders to customers. 
• Has good understanding technology and can wear business hat when required. 
• Someone who has rolled up sleeves and done stellar development work in FinTech/ B2B product organization 


📩 Interested? Send your CV to: recruitment@skeps.com

🔥 Why join us?
Be part of a fast-growing fintech company where your code directly impacts real-world financial solutions.`;

async function main() {
  try {
    console.log("=== STEP 1: SEARCH STRATEGY ===");
    const res = await searchCandidatesAuto("Skeps", "Associate Product Manager", JD, []);
    console.log("Strategy Output:", JSON.stringify({
      company_size_inference: res.company_size_inference,
      department: res.department,
      hiringManagerTitles: res.hiringManagerTitles,
      hrTitles: res.hrTitles,
      deptKeywords: res.deptKeywords
    }, null, 2));
    
    console.log(`\n=== STEP 2: RAW RESULTS (${res.results.length}) ===`);
    res.results.slice(0, 10).forEach((r, i) => console.log(`[${i}] ${r.name} - ${r.title}`));

    console.log("\n=== STEP 3: LLM RANKING ===");
    const ranked = await rankCandidates(res.results, "Skeps", "Associate Product Manager", JD, [], res.deptKeywords);
    
    console.log("Ranked Results Count:", ranked.length);
    ranked.forEach(r => {
      console.log(`\nName: ${r.name}`);
      console.log(`Role: ${r.role_type} (Confidence: ${r.confidence})`);
      console.log(`Title: ${r.current_title}`);
      console.log(`Reason: ${r.reason}`);
    });

  } catch (err) {
    console.error("Test failed:", err);
  }
}

main();
