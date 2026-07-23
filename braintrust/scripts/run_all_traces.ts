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

async function runAllTraces() {
  const dataset = JSON.parse(fs.readFileSync("braintrust/datasets/golden.json", "utf-8"));
  let totalScore = 0;
  
  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    console.log(`\n=== TRACE ${i + 1}/${dataset.length}: ${row.company} ===`);
    
    try {
      // 1. Web Search Enrichment (Serper)
      console.log(`Searching Serper for: ${row.company}`);
      const serperRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { 
          "X-API-KEY": process.env.SERPER_API_KEY || "", 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ q: `${row.company} company size employees linkedin`, num: 1 })
      });
      let companyContext = "Unknown";
      if (serperRes.ok) {
        const serperData = await serperRes.json();
        companyContext = serperData.organic?.[0]?.snippet || "Unknown";
      }
      
      console.log(`Context: ${companyContext}`);
      
      const prompt = loadPrompt("searchStrategy_v1", {
        jobTitle: row.role_title,
        company: row.company,
        jobDescription: row.JD_text.substring(0, 1500),
        companyContext: companyContext
      });
      
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

      if (!res.ok) {
        console.log(`Error running trace for ${row.company}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      let content = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const output = JSON.parse(content);
      const generatedTitles = output.hiringManagerTitles || [];
      const expectedTitles = row.hiring_manager_hypothesis?.map((h: any) => h.title) || [];
      
      const scoreResult = await scoreSearchStrategy({ 
        output: output, 
        expected: { hiring_manager_hypothesis: row.hiring_manager_hypothesis }
      });
      
      console.log(`Expected : ${JSON.stringify(expectedTitles)}`);
      console.log(`Generated: ${JSON.stringify(generatedTitles)}`);
      console.log(`Score    : ${(scoreResult.score * 100).toFixed(1)}%`);
      
      totalScore += scoreResult.score;
    } catch (e: any) {
      console.log(`Error running trace for ${row.company}: ${e.message}`);
    }
    
    // Add a delay to avoid rate limits
    await new Promise(r => setTimeout(r, 8000));
  }
  
  console.log(`\n=== FINAL AVERAGE SCORE: ${((totalScore / dataset.length) * 100).toFixed(1)}% ===`);
}

runAllTraces().catch(console.error);
