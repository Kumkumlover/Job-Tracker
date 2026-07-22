import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config({ path: ".env.local" });

async function trace() {
  const company = "Paramount";
  const query = "Product Manager currently working at Paramount LinkedIn profile";
  
  const traces: any = {
    Tavily: { input: null, output: null },
    Exa: { input: null, output: null }
  };

  // 1. Tavily
  const tavilyBody = {
    api_key: process.env.TAVILY_API_KEY,
    query,
    search_depth: "basic",
    include_domains: ["linkedin.com"],
    max_results: 3,
  };
  traces.Tavily.input = { url: "https://api.tavily.com/search", body: { ...tavilyBody, api_key: "HIDDEN" } };
  
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tavilyBody),
    });
    traces.Tavily.output = await res.json();
  } catch (e: any) {
    traces.Tavily.output = e.message;
  }

  // 2. Exa
  const exaBody = {
    query: "Here is a LinkedIn profile of a Product Manager currently working at Paramount:",
    type: "neural",
    useAutoprompt: false,
    numResults: 3,
    includeDomains: ["linkedin.com"],
    contents: { text: { maxCharacters: 400 } }
  };
  traces.Exa.input = { url: "https://api.exa.ai/search", body: exaBody };
  
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-api-key": process.env.EXA_API_KEY || ""
      },
      body: JSON.stringify(exaBody),
    });
    traces.Exa.output = await res.json();
  } catch (e: any) {
    traces.Exa.output = e.message;
  }

  // 3. Serper (Google)
  const serperBody = {
    q: "site:linkedin.com/in/ \"Paramount\" (\"Product Manager\" OR \"Head of Product\")",
    num: 3
  };
  traces.Serper = {
    input: { url: "https://google.serper.dev/search", body: serperBody },
    output: null
  };
  
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY || "",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(serperBody)
    });
    traces.Serper.output = await res.json();
  } catch (e: any) {
    traces.Serper.output = e.message;
  }

  const outPath = path.join(process.cwd(), "scratch/api_trace.json");
  if (!fs.existsSync("scratch")) fs.mkdirSync("scratch");
  fs.writeFileSync(outPath, JSON.stringify(traces, null, 2));
  console.log("Trace saved to scratch/api_trace.json");
}

trace();
