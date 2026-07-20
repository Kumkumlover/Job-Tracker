import { Eval } from "braintrust";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { 
  scoreCompanyResearch, 
  scoreSearchStrategy, 
  scoreCandidateValidation, 
  scoreEmailHook 
} from "./scorers/extractionScorers";
import { searchCandidatesAuto } from "../src/lib/pipeline/search";
import { rankCandidates } from "../src/lib/pipeline/rank";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// --- Caching and Credit Limit Logic for APIs ---
const CACHE_DIR = path.join(process.cwd(), "braintrust/.cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

let apiCallCount = 0;
const MAX_API_CALLS_PER_RUN = 100; // ~10% of free tier limits

async function fetchLiveSearchCached(query: string, engine: "serper" | "exa" | "linkedin") {
  const hash = crypto.createHash("md5").update(`${engine}-${query}`).digest("hex");
  const cachePath = path.join(CACHE_DIR, `${hash}.json`);
  
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  }

  if (apiCallCount >= MAX_API_CALLS_PER_RUN) {
    console.warn("⚠️ API Credit Limit Reached. Returning empty mock to protect credits.");
    return [];
  }

  apiCallCount++;
  
  // Simulated API Call
  // In a real run, this would be: await fetch("https://google.serper.dev/search", ...)
  const mockResults = [
    { name: "John Doe", title: "Director of Engineering", department: "Engineering", company: "TestCorp", isCurrentEmployee: true }
  ];
  
  fs.writeFileSync(cachePath, JSON.stringify(mockResults), "utf-8");
  return mockResults;
}

import { fetchGroqSequential } from "./rateLimiter";

// --- LLM Wrappers ---
function loadPrompt(name: string, variables: Record<string, string>): string {
  const filePath = path.join(process.cwd(), "src/lib/automation/prompts", `${name}.txt`);
  if (!fs.existsSync(filePath)) return "";
  let content = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return content;
}

async function callLLM(prompt: string, retries = 5): Promise<any> {
  const provider = process.env.LLM_PROVIDER || "gemini";
  
  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
    
    const res = await fetchGroqSequential("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try { return JSON.parse(cleaned); } catch { return { _raw: cleaned }; }
    }
    
    const errorText = await res.text();
    throw new Error(`Groq HTTP Error: ${res.status} - ${errorText}`);
  }

  // Fallback to Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  // Delay for 16 seconds to STRICTLY guarantee under 4 requests per rolling minute
  // (Google's free tier has a hard limit of 5 RPM)
  await new Promise(r => setTimeout(r, 16000));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.1, 
          maxOutputTokens: 2048,
          response_mime_type: "application/json",
          response_schema: {
            type: "OBJECT",
            properties: {
              industry: { type: "STRING" },
              core_products: { type: "STRING" },
              stage: { type: "STRING" },
              mission_statement: { type: "STRING" }
            },
            required: ["industry", "core_products", "stage", "mission_statement"]
          }
        },
      }),
    }
  );

  if (res.ok) {
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse JSON:", cleaned);
      return { _raw: cleaned };
    }
  }
  
  const errorText = await res.text();
  if ((res.status === 429 || res.status === 503) && retries > 0) {
    console.warn(`Gemini Rate limited or Unavailable (HTTP ${res.status}). Waiting 45s and retrying... (${retries} left)`);
    await new Promise(r => setTimeout(r, 45000));
    return callLLM(prompt, retries - 1);
  }
  
  console.error(`HTTP Error ${res.status}: ${errorText}`);
  throw new Error(`HTTP Error: ${res.status}`);
}

// --- Evals ---

const datasetPath = path.join(process.cwd(), "braintrust/datasets/golden.json");
const dataset = fs.existsSync(datasetPath) ? JSON.parse(fs.readFileSync(datasetPath, "utf-8")) : [];

if (dataset.length > 0) {
  /*
  Eval("Job-Tracker-Company-Research", {
    data: dataset.slice(0, 10).map((d: any) => ({ input: d, expected: d })), // Limit to 10 for more evidence
    maxConcurrency: 1, // Enforce 1 by 1 execution to prevent LLM rate limits
    task: async (input) => {
      const prompt = loadPrompt("company_summary_v1", { company: input.company, jd: input.JD_text });
      return await callLLM(prompt);
    },
    scores: [(args) => scoreCompanyResearch({ output: args.output, expected: args.expected })]
  });
  */

  /*
  Eval("Job-Tracker-Search-Strategy", {
    data: dataset.slice(0, 5).map((d: any) => ({ input: d, expected: d })), // Limit to 5 for fast iteration
    maxConcurrency: 1,
    task: async (input) => {
      const prompt = loadPrompt("searchStrategy_v1", { 
        jobTitle: input.role_title || "",
        company: input.company || "", 
        jd: input.JD_text || ""
      });
      return await callLLM(prompt);
    },
    scores: [(args) => scoreSearchStrategy({ output: args.output, expected: args.expected })]
  });
  */

  /*
  Eval("Job-Tracker-Candidate-Ranking", {
    data: dataset.slice(5, 15).map((d: any) => ({ input: d, expected: d })), // Next 10 openings
    maxConcurrency: 1, // Prevent rate limits on Serper/Exa
    task: async (input: any) => {
      // 1. Full search engine pipeline (Serper + Exa + Tavily + Deduplication + Strategy)
      const { results: rawCandidates, deptKeywords } = await searchCandidatesAuto(
        input.company,
        input.role_title,
        input.JD_text
      );
      
      // 2. Full LLM Validation filtering (using Llama 70B implicitly via the prompt fixes)
      const validatedCandidates = await rankCandidates(
        rawCandidates,
        input.company,
        input.role_title,
        input.JD_text,
        [], // excludeNames
        deptKeywords
      );

      return { predicted: validatedCandidates };
    },
    scores: [(args: any) => scoreCandidateValidation({ 
      predicted: args.output.predicted, 
      expectedCompany: args.expected.company, 
      expectedDepartments: [args.expected.department, args.expected.role_title]
    })]
  });
  */

  Eval("Job-Tracker-Email-Hook-Generation", {
    data: dataset.slice(0, 5).map((d: any) => ({ input: d, expected: d })),
    maxConcurrency: 2,
    task: async (input: any) => {
      // 1. Extract Company Context (simulate Step 1)
      const researchPrompt = loadPrompt("company_summary_v1", {
        company: input.company,
        jd: input.JD_text || ""
      });
      const researchRaw = await callLLM(researchPrompt);
      let companyContext = input.company;
      if (researchRaw && researchRaw.industry) {
        companyContext = "Industry: " + researchRaw.industry + "\\nProducts: " + researchRaw.core_products + "\\nMission: " + researchRaw.mission_statement;
      } else {
        console.warn("Failed to parse research context for", input.company);
      }

      // 2. Generate Email Hook (wrapped in JSON so callLLM works)
      const emailPrompt = `You are an expert cold-email copywriter writing to a hiring manager at ${input.company}.
      Company Mission/Profile: ${companyContext}

      Task: Write a single 1-2 sentence paragraph explaining why you are excited about this specific company. 
      You MUST ground your reasoning strictly in the Company Mission/Profile provided above. 
      Do NOT invent fake metrics, fake values, or hallucinate facts that are not in the profile.
      
      Return ONLY a JSON object with a single key "hook" containing your sentence.`;
      
      const rawHook = await callLLM(emailPrompt);
      let generatedHook = "";
      try {
        generatedHook = JSON.parse(rawHook.replace(/^```json\n?|```\n?$/g, "").trim()).hook;
      } catch (e) {
        generatedHook = rawHook; // fallback
      }

      return { companyContext, generatedHook };
    },
    scores: [
      (args: any) => scoreEmailHook({ 
        companyMission: args.output.companyContext, 
        generatedHook: args.output.generatedHook 
      })
    ]
  });
} else {
  console.log("⏳ Dataset braintrust/datasets/golden.json is missing or empty.");
}
