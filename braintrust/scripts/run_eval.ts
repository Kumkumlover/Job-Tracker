
import { config } from "dotenv";
config({ path: ".env.local" });
import { Eval } from "braintrust";
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

const DATASET = [
  {
    input: { company: "Presolv360", jobTitle: "Product Intern", jd: JD },
    expected: "Should find at least 1 hiring manager and extract JD contacts"
  }
];

async function task(input: any) {
  console.log(`\nRunning pipeline for ${input.company} - ${input.jobTitle}`);
  const { results: rawResults, jdContacts, deptKeywords, companyContext } = await searchCandidatesAuto(input.company, input.jobTitle, input.jd, []);
  
  const ranked = rawResults.length 
    ? await rankCandidates(rawResults, input.company, input.jobTitle, input.jd, [], deptKeywords, companyContext)
    : [];
    
  return {
    rawResultsCount: rawResults.length,
    jdContacts,
    rankedCandidates: ranked
  };
}

function candidateCountScorer({ output }: { output: any }) {
  const score = output.rankedCandidates.length > 0 ? 1 : 0;
  return {
    name: "CandidateFound",
    score
  };
}

function jdContactScorer({ output }: { output: any }) {
  const foundChahal = output.jdContacts.some((c: any) => c.email === "chahal.shah@presolv360.com");
  return {
    name: "JDContactExtracted",
    score: foundChahal ? 1 : 0
  };
}

async function main() {
  await Eval("Job Tracker Pipeline", {
    data: DATASET,
    task: task,
    scores: [candidateCountScorer, jdContactScorer],
    maxConcurrency: 1
  });
}

main();
