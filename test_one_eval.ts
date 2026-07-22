import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { scoreSearchStrategy } from "./braintrust/scorers/extractionScorers";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function loadPrompt(name: string, variables: Record<string, string>): string {
  const filePath = path.join(process.cwd(), `src/lib/automation/prompts/${name}.txt`);
  let promptTemplate = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    promptTemplate = promptTemplate.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return promptTemplate;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callLLM(prompt: string): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  await delay(4000);
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function testOneEval() {
  const dataset = JSON.parse(fs.readFileSync("braintrust/datasets/golden.json", "utf-8"));
  // Select which dataset row to test (e.g. index 12 = Spotlyte)
  const TEST_INDEX = 12;
  const row = dataset[TEST_INDEX];
  
  console.log(`=== TESTING: ${row.company} ===`);
  console.log(`Expected HM titles: ${JSON.stringify(row.hiring_manager_hypothesis.map((h: any) => h.title))}`);
  console.log("");

  // Step 1: Run the searchStrategy prompt (same as eval.ts does)
  const prompt = loadPrompt("searchStrategy_v1", { 
    jobTitle: row.role_title,
    company: row.company, 
    jd: row.JD_text
  });
  const output = await callLLM(prompt);
  console.log(`Generated HM titles: ${JSON.stringify(output.hiringManagerTitles)}`);
  console.log("");

  // Step 2: Run the scorer (same as eval.ts does)
  const scoreResult = await scoreSearchStrategy({ output, expected: row });
  console.log("=== SCORER RESULT ===");
  console.log(`Score: ${scoreResult.score}`);
  console.log(`Reasoning: ${scoreResult.metadata?.reasoning}`);
  console.log(`Expected: ${JSON.stringify(scoreResult.metadata?.expectedTitles)}`);
  console.log(`Generated: ${JSON.stringify(scoreResult.metadata?.generatedTitles)}`);
}

testOneEval().catch(console.error);
