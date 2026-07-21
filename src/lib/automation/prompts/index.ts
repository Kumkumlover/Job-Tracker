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
3. If it is a Startup, you MUST include "Founder" or "Co-Founder".
4. If the role is "Intern" or "Junior", the hiring manager is usually a "Product Manager", "Senior Product Manager", or "Head of Product" (not an intern).
5. LIMIT the hiringManagerTitles array to exactly 3-4 highly probable, concise titles. Do NOT hallucinate bloated variants like "Product Development Manager" or "Product Owner" unless explicitly supported by the JD.

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
2. REJECT if they are in a totally unrelated department like Sales, Finance, Operations, or Engineering when we need "{{llmDeptKeywords}}". HOWEVER, DO NOT reject HR, Recruiters, or Talent Acquisition - they are always valid contacts.
3. NEVER reject "Founder", "Co-Founder", "CEO", or other C-level executives. They are always valid contacts regardless of the target department.
4. DO NOT reject just because the snippet is vague or doesn't explicitly say "current" - most LinkedIn snippets don't.
5. When in doubt, INCLUDE the candidate with lower confidence (0.5). It is better to include a false positive than miss a real person.

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
      "reason": "<10 words>" 
    } 
  ] 
}
Include everyone who passes the rules above. Return ONLY valid JSON. Do NOT use Python's 'None' or 'null', use empty strings ("").`
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

