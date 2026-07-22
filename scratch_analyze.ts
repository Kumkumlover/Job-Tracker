import fs from "fs";
import path from "path";
import dotenv from "dotenv";

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
let groqQueue = Promise.resolve(new Response());

async function callLLM(prompt: string, retries = 3): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY;
  for (let i = 0; i < retries; i++) {
    try {
      return await new Promise<any>((resolve, reject) => {
        groqQueue = groqQueue.then(async () => {
          try {
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
            
            if (!res.ok) {
                if (res.status === 429) {
                    console.log("Hit rate limit, waiting 20s...");
                    await delay(20000);
                    throw new Error("429");
                }
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            await delay(4000); // Wait 4s to prevent 429
            resolve(JSON.parse(data.choices?.[0]?.message?.content || "{}"));
            return res;
          } catch (err) {
            reject(err);
            return new Response();
          }
        });
      });
    } catch (err: any) {
        if (err.message !== "429" || i === retries - 1) throw err;
    }
  }
}

async function analyze() {
  const datasetPath = path.join(process.cwd(), "braintrust/datasets/golden.json");
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
  
  const sample = dataset.slice(0, 10);
  const results = [];
  const outPath = path.join(process.cwd(), "scratch_analysis_output.json");
  
  for (const row of sample) {
    console.log(`Analyzing: ${row.company} - ${row.role_title}`);
    try {
      const prompt1 = loadPrompt("company_summary_v1", { company: row.company, jd: row.JD_text });
      const step1 = await callLLM(prompt1);
      
      const prompt2 = loadPrompt("searchStrategy_v1", { 
        jobTitle: row.role_title || "",
        company: row.company || "", 
        jd: row.JD_text || ""
      });
      const step2 = await callLLM(prompt2);
      
      results.push({
        company: row.company,
        role: row.role_title,
        golden_expected_stage: row.stage,
        golden_expected_titles: row.hiring_manager_hypothesis?.map((h: any) => h.title),
        step1_output: step1,
        step2_output: step2
      });
      
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    } catch (e: any) {
        console.log(`Failed on ${row.company}: ${e.message}`);
    }
  }
  
  console.log("Done!");
}

analyze().catch(console.error);
