const prompts: Record<string, string> = {
  missionExtract_v1: `You are an expert product marketer and recruiter. Your goal is to extract exactly TWO specific noun phrases from the following job description.

Company: {{company}}
Role: {{jobTitle}}
{{jobDescription}}

Return a raw JSON object (no markdown formatting, no \`\`\`json) with exactly two keys:
1. "companyMission": A short, punchy noun phrase (3-6 words) describing what they are building or their overarching goal (e.g., "AI-powered dispute resolution", "next-gen financial infrastructure", "automated recruiting workflows").
2. "matchedStrengths": A short noun phrase (4-8 words) describing the core hard skills or domain expertise they are looking for (e.g., "0-1 product delivery and AI-powered feature development", "B2B SaaS scaling and data analytics", "user research and agile product management").

JSON:`,

  searchStrategy_v1: `You are an expert Recruiting & OSINT Intelligence Engine.
Given a Job Description and the target company's name, analyze the text to figure out EXACTLY what titles to search for to find the Hiring Manager on LinkedIn.

CONTEXT:
Job Title: "{{jobTitle}}"
Company: "{{company}}"
Company Context (from Web Search): "{{companyContext}}"

EDGE CASES & RULES:
1. DETERMINE COMPANY SIZE: Read the "Company Context" to find the employee count.
   - If >200 employees (e.g. "501-1,000 employees", "10,001+ employees"), it is an Enterprise.
   - If <=200 employees (e.g. "11-50 employees"), it is a Startup.
   - If employee count is unknown, assume Enterprise.
2. If it is an Enterprise, you MUST NOT generate "Founder" or "Co-Founder". Use titles like "Head of Product", "VP of Product", "Director of Engineering".
3. MICRO-DEPARTMENTS (Crucial for Enterprise): Large companies (5000+ employees) like ICICI Bank or Google hire for specific verticals (e.g., "Payments", "Credit Cards", "Trust & Safety", "Cloud"). You MUST extract this specific micro-department from the JD and include it in \`deptKeywords\`.
4. If it is a Startup, you MUST include "Founder" or "Co-Founder".
5. If the role is "Intern" or "Junior", the hiring manager is usually a "Product Manager", "Senior Product Manager", or "Head of Product" (not an intern).
6. LIMIT the hiringManagerTitles array to exactly 3-4 highly probable, concise titles. Do NOT hallucinate bloated variants like "Product Development Manager" or "Product Owner" unless explicitly supported by the JD.

Return a JSON object:
{
  "company_size_inference": "startup" or "enterprise",
  "department": "Specific functional team (e.g. 'Product Management')",
  "hiringManagerTitles": ["Exactly 3-4 concise LinkedIn job titles for likely hiring managers"],
  "hrTitles": ["2 concise HR/Recruiter titles like 'Technical Recruiter' or 'Talent Acquisition'"],
  "deptKeywords": "Short 2-4 word string summarizing the core domain",
  "companyModifier": "Short 1-2 word location or industry keyword found in the JD"
}

Job Description (first 1500 chars):
{{jd}}

Return ONLY the JSON. No markdown, no explanation.`,

  candidateRank_v1: `You are filtering LinkedIn search results for a job opening at "{{company}}" for role "{{jobTitle}}".
{{companyContext}}
Below are LinkedIn search results. Each result indicates which search engines found it - profiles confirmed by multiple independent engines are far more likely to be current employees.

REJECTION RULES (HARD RULES - only reject if CLEARLY true):
1. REJECT if the snippet explicitly says "Ex-{{company}}", "Former {{company}}", "ex @{{company}}", "Left {{company}}", or lists a DIFFERENT company as their obvious CURRENT employer (e.g. "Product Manager at Google | Ex-{{company}}").
2. REJECT if they are in a totally unrelated department (e.g. Sales, Finance) when we need "{{llmDeptKeywords}}". HOWEVER, use common sense: hiring managers are often just senior versions of the role (e.g. if the role is 'APM' or 'Product Intern', do NOT reject 'Product Manager' or 'Senior Product Manager'. If the role is 'Frontend Engineer', do NOT reject 'Engineering Manager' or 'Tech Lead'). HR, Recruiters, and Talent Acquisition are ALWAYS valid contacts.
3. NEVER reject "Founder", "Co-Founder", "CEO", or other C-level executives. They are always valid contacts regardless of the target department.
4. DO NOT reject just because the snippet is vague or doesn't explicitly say "current" - most LinkedIn snippets don't.
5. When in doubt, INCLUDE the candidate with lower confidence (0.5). It is better to include a false positive than miss a real person.

CLASSIFICATION RULES for "role_type":
- "hiring_manager": Assign this to Founders, C-level executives, OR anyone in the target department who holds a senior title (e.g. "Senior Product Manager", "VP of Engineering", "Lead Designer"). 
  - MICRO-DEPARTMENT PRIORITIZATION: If "{{llmDeptKeywords}}" contains a specific micro-department (e.g. "Payments"), prioritize candidates who specifically match that domain. However, if no perfect domain match is found (or if the company is small), generic senior roles (e.g. "VP of Product") are perfectly acceptable as hiring managers. Do NOT reject generic senior people just because they lack the specific micro-department keyword.
- "team_lead": Assign this to mid-level employees in the target department who might interview the candidate (e.g. "Product Manager", "Software Engineer"), or senior employees in the wrong micro-department.
- "other": Assign this ONLY to HR, Recruiters, and Talent Acquisition. They are NOT the hiring manager.

Candidates:
{{searchResults}}

Return JSON: 
{ 
  "topCandidates": [ 
    { 
      "index": <number from list above>,
      "name": "<name>",
      "current_title": "<their title>", 
      "confidence": <0.4-0.95>, 
      "role_type": "hiring_manager" | "team_lead" | "other", 
      "reason": "<max 3 words>" 
    } 
  ] 
}
CRITICAL: You MUST return an entry for EVERY SINGLE candidate provided in the input list. Do not skip anyone. If you are given 20 candidates, you must return exactly 20 items in the array. Return ONLY valid JSON.`
};

export function loadPrompt(name: string, variables: Record<string, string>): string {
  let content = prompts[name];
  if (!content) {
    throw new Error(`Prompt ${name} not found in static prompts map.`);
  }
  
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return content;
}

