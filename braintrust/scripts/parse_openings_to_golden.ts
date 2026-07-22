import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let groqQueue = Promise.resolve(new Response());

async function fetchGroqSequential(url: string, options: any) {
  return new Promise<Response>((resolve, reject) => {
    groqQueue = groqQueue.then(async () => {
      try {
        const res = await fetch(url, options);
        await delay(3500); 
        resolve(res);
        return res;
      } catch (err) {
        reject(err);
        return new Response();
      }
    });
  });
}

const groqPrompt = `You are an expert tech recruiter. I will give you a Job Description (JD). Your task is to extract structured metadata from the JD.

CRITICAL RULES:
- "hiring_manager_hypothesis" means: What is the job title of the PERSON WHO POSTED this job? The person who would be the direct manager or boss of whoever gets hired. This is NOT about the candidate. This is about who at the company is doing the hiring.
- Example: If the JD is for "Software Engineer Intern", the hiring_manager_hypothesis might be [{"title": "Engineering Manager", "confidence": 0.9}, {"title": "CTO", "confidence": 0.7}].
- Example: If the JD is for "Associate Product Manager", the hiring_manager_hypothesis might be [{"title": "Head of Product", "confidence": 0.9}, {"title": "Senior Product Manager", "confidence": 0.8}].
- NEVER put candidate descriptions, requirements, or qualifications in hiring_manager_hypothesis. Only put LinkedIn-style job titles of the hiring manager.
- You MUST provide 2-3 hiring manager titles with different confidence levels. Think about who the direct manager would be AND who the skip-level manager would be.
- For startups, ALWAYS include "Founder" or "Co-Founder" as one of the titles.
- "stage" must be one of: "Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth", "Public", "Unknown".
- "seniority" must be one of: "Intern", "Junior", "Mid", "Senior", "Lead", "Manager", "Director", "VP", "C-Level".

Return exactly this JSON schema:
{
  "industry": "One-word or short phrase (e.g. 'Fintech', 'Healthcare', 'E-commerce')",
  "stage": "One of the stage values listed above",
  "product_summary": "One sentence about what the company does",
  "role_title": "Exact title from the JD",
  "department": "e.g. 'Product', 'Engineering', 'Marketing'",
  "seniority": "One of the seniority values listed above",
  "key_responsibilities": ["responsibility 1", "responsibility 2"],
  "required_skills": ["skill 1", "skill 2"],
  "preferred_skills": ["skill 1", "skill 2"],
  "hiring_manager_hypothesis": [{"title": "Actual LinkedIn job title of the likely hiring manager", "confidence": 0.9}]
}

Here is the JD text:
`;


async function parseJdWithGroq(jdText: string, company: string, url: string) {
  const apiKey = process.env.GROQ_API_KEY;
  const res = await fetchGroqSequential('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: groqPrompt + jdText }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });
  
  if (res.ok) {
    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      const parsed = JSON.parse(content);
      parsed.company = company;
      parsed.company_url = url;
      parsed.JD_text = jdText;
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

async function run() {
  const filePath = 'C:/Users/Lenovo/Downloads/n8n-data-20260510T162446Z-3-001/n8n-data/Opening Details.txt';
  const text = fs.readFileSync(filePath, 'utf-8');
  
  // Split by number followed by dot — handles both "3. " and "3.Cashify" patterns
  const rawBlocks = text.split(/(?:^|\r?\n)\d+\.\s*/).filter(b => b.trim().length > 0);
  
  console.log(`Found ${rawBlocks.length} job postings in the text file.`);
  
  const finalDataset = [];
  
  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i].trim();
    // First line usually has "Company, Title, URL"
    const lines = block.split('\n');
    const firstLine = lines[0] || '';
    
    // Naive extraction: usually split by comma
    const parts = firstLine.split(',');
    const company = parts[0] ? parts[0].trim() : `Company_${i+1}`;
    const urlMatches = block.match(/https?:\/\/[^\s]+/);
    const url = urlMatches ? urlMatches[0] : '';
    
    console.log(`[${i+1}/${rawBlocks.length}] Parsing ${company}...`);
    
    const parsed = await parseJdWithGroq(block, company, url);
    if (parsed) {
      finalDataset.push(parsed);
    } else {
      console.log(`Failed to parse ${company}`);
    }
  }

  const outDir = path.join(process.cwd(), 'braintrust/datasets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'golden.json');
  
  fs.writeFileSync(outPath, JSON.stringify(finalDataset, null, 2));
  console.log(`\n✅ Successfully wrote ${finalDataset.length} rows to golden.json`);
}

run().catch(console.error);
