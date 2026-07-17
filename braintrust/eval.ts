import { Eval } from "braintrust";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { missionRelevance, strengthsAlignment } from "./scorers/extractionScorers";

// Mock the prompt loading logic
function loadPrompt(name: string, variables: Record<string, string>): string {
  const filePath = path.join(process.cwd(), "src/lib/automation/prompts", `${name}.txt`);
  let content = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return content;
}

// Function that mimics the production route.ts fetch
async function extractMissionForEval(input: any) {
  const { company, jobTitle, jobDescription } = input;
  const llmPrompt = loadPrompt("missionExtract_v1", {
    company,
    jobTitle,
    jobDescription: jobDescription ? `Job Description:\n${jobDescription.slice(0, 2000)}` : ""
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
      }),
    }
  );

  if (res.ok) {
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } else {
    throw new Error(`HTTP Error: ${res.status}`);
  }
}

// Load dataset
const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, "datasets/mission_extracts.json"), "utf-8"));

Eval("Job-Tracker-Outreach-Mission", {
  data: dataset,
  task: async (input) => {
    return await extractMissionForEval(input);
  },
  scores: [
    (args) => missionRelevance({ 
      input: args.input.jobDescription, 
      output: args.output.companyMission, 
      expected: args.expected?.companyMission 
    }),
    (args) => strengthsAlignment({ 
      input: args.input.jobDescription, 
      output: args.output.matchedStrengths, 
      expected: args.expected?.matchedStrengths 
    })
  ],
  maxConcurrency: 2,
});
