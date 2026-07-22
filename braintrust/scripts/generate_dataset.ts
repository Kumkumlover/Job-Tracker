import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let groqQueue = Promise.resolve(new Response());

async function fetchGroqSequential(url: string, options: any) {
  return new Promise<Response>((resolve, reject) => {
    groqQueue = groqQueue.then(async () => {
      try {
        const res = await fetch(url, options);
        await delay(3500); // Strict 3.5s pacing for Groq Free Tier
        resolve(res);
        return res;
      } catch (err) {
        reject(err);
        return new Response();
      }
    });
  });
}

async function serperSearch(query: string) {
  const apiKey = process.env.SERPER_API_KEY;
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10 }) // Free tier allows num 10 without pagination
    });
    if (!res.ok) {
        console.error("Serper API error:", await res.text());
        return [];
    }
    const data = await res.json();
    return data.organic || [];
  } catch (e) {
    console.error("Fetch error in serperSearch:", e);
    return [];
  }
}

async function fetchJDText(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, header, footer, nav').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.substring(0, 5000); 
  } catch (e) {
    return null;
  }
}

const groqPrompt = `You are a recruiting expert. I will give you the text of a Job Description. 
Extract the following fields and return exactly this JSON schema and nothing else:
{
  "industry": "...", 
  "stage": "...", 
  "product_summary": "...", 
  "role_title": "...", 
  "department": "...", 
  "seniority": "...", 
  "key_responsibilities": ["...", "..."], 
  "required_skills": ["...", "..."], 
  "preferred_skills": ["...", "..."], 
  "hiring_manager_hypothesis": [{ "title": "...", "confidence": 0.9 }]
}
Try your best to infer industry and stage if it's not explicitly stated.
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
    const content = data.choices?.[0]?.message?.content || "";
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
  console.log("Starting Serper scraping for unique companies...");
  const queries = [
    'site:jobs.lever.co "Software Engineer"',
    'site:boards.greenhouse.io "Product Manager"',
    'site:jobs.lever.co "Data Scientist"',
    'site:boards.greenhouse.io "Marketing"',
    'site:jobs.lever.co "Sales"',
    'site:boards.greenhouse.io "Designer"',
    'site:jobs.lever.co "HR"',
    'site:boards.greenhouse.io "DevOps"',
    'site:jobs.lever.co "Customer Success"',
    'site:boards.greenhouse.io "Finance"',
    'site:jobs.lever.co "Backend Engineer"',
    'site:boards.greenhouse.io "Frontend Engineer"',
    'site:jobs.lever.co "Legal Counsel"',
    'site:boards.greenhouse.io "Account Executive"',
    'site:jobs.lever.co "Operations Manager"',
    'site:boards.greenhouse.io "Machine Learning"',
    'site:jobs.lever.co "Security Engineer"',
    'site:boards.greenhouse.io "Recruiter"'
  ];

  const uniqueCompanies = new Set<string>();
  const rawJds = [];

  for (const query of queries) {
    if (uniqueCompanies.size >= 100) break;
    console.log(`Searching: ${query}`);
    const results = await serperSearch(query);
    
    for (const r of results) {
      if (uniqueCompanies.size >= 100) break;
      
      const url = r.link;
      let company = "";
      if (url.includes('jobs.lever.co/')) {
        company = url.split('jobs.lever.co/')[1].split('/')[0];
      } else if (url.includes('boards.greenhouse.io/')) {
        company = url.split('boards.greenhouse.io/')[1].split('/')[0];
      }
      
      if (company && !uniqueCompanies.has(company)) {
        uniqueCompanies.add(company);
        rawJds.push({ company, url });
      }
    }
  }

  console.log(`Gathered ${rawJds.length} unique URLs. Starting fetch & Groq parsing...`);
  const finalDataset = [];
  
  // Create dir if missing
  const dir = path.join(process.cwd(), 'braintrust/datasets');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const outPath = path.join(dir, 'golden.json');

  for (let i = 0; i < rawJds.length; i++) {
    console.log(`[${i+1}/${rawJds.length}] Processing ${rawJds[i].company}...`);
    const text = await fetchJDText(rawJds[i].url);
    if (text && text.length > 500) {
      const parsed = await parseJdWithGroq(text, rawJds[i].company, rawJds[i].url);
      if (parsed && parsed.role_title) {
        finalDataset.push(parsed);
        // Save incrementally just in case
        fs.writeFileSync(outPath, JSON.stringify(finalDataset, null, 2));
      } else {
        console.log(`Failed to parse with Groq for ${rawJds[i].company}`);
      }
    } else {
      console.log(`Failed to fetch or text too short for ${rawJds[i].company}`);
    }
  }

  console.log(`\n✅ Successfully wrote ${finalDataset.length} unique rows to golden.json`);
}

run().catch(console.error);
