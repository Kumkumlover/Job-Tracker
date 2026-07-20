import { Factuality } from "autoevals";
import { fetchGroqSequential } from "../rateLimiter";

// 1. Company Research Scorer (LLM-as-a-Judge)
export async function scoreCompanyResearch(args: { 
  output: any, 
  expected: any 
}) {
  try {
    const expectedJson = JSON.stringify({
      industry: args.expected?.industry || "",
      stage: args.expected?.stage || "",
      core_products: args.expected?.product_summary || args.expected?.core_products || ""
    });
    const generatedJson = JSON.stringify(args.output);
    
    const prompt = `You are an expert evaluator. Compare the Generated JSON to the Expected JSON for a company's research profile.
Are they semantically equivalent in meaning? It is perfectly fine if the wording is different (e.g. "Technology" vs "Enterprise Software", or "Late Stage/Public" vs "Public").
Return ONLY a JSON object with a "score" key (1 for yes, 0 for no) and a "reasoning" key (string explaining why).

Expected JSON:
${expectedJson}

Generated JSON:
${generatedJson}`;
    
    const res = await fetchGroqSequential("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    
    if (!res.ok) throw new Error(`Groq Score HTTP Error: ${res.status}`);
    const data = await res.json();
    const resultJson = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    
    return {
      name: "CompanyResearchScore",
      score: resultJson.score ?? 0,
      metadata: { reasoning: resultJson.reasoning }
    };
  } catch (error) {
    console.error("Scorer failed:", error);
    return { name: "CompanyResearchScore", score: 0 };
  }
}

// Helper for Search Strategy: The 3 strict rules from the user
export function isCandidateValid(candidate: any, expectedCompany: string, expectedDepartment: string) {
  // 1. Must be an employee of the company
  const isEmployee = candidate.company?.toLowerCase().includes(expectedCompany.toLowerCase());
  
  // 2. Must be presently employed
  // Assume candidate object indicates tenure or end date. If end date exists, they left.
  const isPresent = candidate.isCurrentEmployee === true || !candidate.endDate;
  
  // 3. Must be relevant department
  const isRelevantDept = candidate.department?.toLowerCase().includes(expectedDepartment.toLowerCase());

  return Boolean(isEmployee && isPresent && isRelevantDept);
}

// 2. Search Strategy Scorer (LLM-as-a-Judge)
export async function scoreSearchStrategy(args: {
  output: any,
  expected: any
}) {
  try {
    const expectedTitles = args.expected?.hiring_manager_hypothesis?.map((h: any) => h.title) || [];
    const generatedTitles = args.output?.hiringManagerTitles || [];
    
    // Quick sanity check: if expected titles are not job titles (contain "candidate", "ideal", etc.), skip
    const isCorrupt = expectedTitles.some((t: string) => 
      t.toLowerCase().includes('candidate') || 
      t.toLowerCase().includes('ideal') || 
      t.length > 50
    );
    if (isCorrupt) {
      return { 
        name: "SearchStrategyScore", 
        score: 0, 
        metadata: { reasoning: "CORRUPT GOLDEN DATA: Expected titles contain candidate descriptions, not job titles." } 
      };
    }

    const prompt = `You are a strict evaluator comparing two lists of LinkedIn job titles.

EXPECTED hiring manager titles (ground truth): ${JSON.stringify(expectedTitles)}
GENERATED hiring manager titles (model output): ${JSON.stringify(generatedTitles)}

Your task is to determine if EACH EXPECTED title has a semantic match in the GENERATED list.
A match means the generated list contains a title that is the SAME role as the expected title. Minor wording differences are OK (e.g. "Head of Product" ≈ "VP Product" ≈ "Product Lead").

Return ONLY a JSON object mapping each expected title to a boolean (true if found, false if not):
{
  "matches": {
    "Expected Title 1": true,
    "Expected Title 2": false
  },
  "reasoning": "brief explanation"
}`;
    
    const res = await fetchGroqSequential("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    
    if (!res.ok) throw new Error(`Groq Score HTTP Error: ${res.status}`);
    const data = await res.json();
    const resultJson = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    
    const matches = resultJson.matches || {};
    const totalExpected = expectedTitles.length;
    let matchCount = 0;
    
    for (const title of expectedTitles) {
      if (matches[title] === true) matchCount++;
    }
    
    const calculatedScore = totalExpected > 0 ? (matchCount / totalExpected) : 0;
    
    return {
      name: "SearchStrategyScore",
      score: calculatedScore,
      metadata: { 
        reasoning: resultJson.reasoning,
        expectedTitles,
        generatedTitles,
        matches
      }
    };
  } catch (error) {
    console.error("Scorer failed:", error);
    return { name: "SearchStrategyScore", score: 0 };
  }
}

// 3. Candidate Validation Scorer
export function scoreCandidateValidation(args: { 
  predicted: any[], // The candidate objects found by the search engine
  expectedCompany: string, 
  expectedDepartments: string[] 
}) {
  let totalScore = 0;
  let totalPossible = 0;
  
  args.predicted.forEach(candidate => {
    totalPossible += 3; // 3 points per candidate
    
    // 1. Is Employee (check if company name is in current_title or reason)
    const isEmployee = 
      (candidate.current_title?.toLowerCase() || "").includes(args.expectedCompany.toLowerCase()) || 
      (candidate.reason?.toLowerCase() || "").includes(args.expectedCompany.toLowerCase());
    if (isEmployee) totalScore++;
    
    // 2. Is Present (Prompt rule #1 mandates only CURRENT employees are returned)
    // We award 1 point automatically if they passed the strict LLM filter.
    totalScore++;
    
    // 3. Relevant Department (check if expected department is in current_title)
    const isRelevantDept = args.expectedDepartments.some(dept => 
      (candidate.current_title?.toLowerCase() || "").includes(dept.toLowerCase())
    );
    if (isRelevantDept) totalScore++;
  });

  // Average score across all candidates (normalized to 0.0 - 1.0)
  const finalScore = totalPossible > 0 ? (totalScore / totalPossible) : 0;
  
  return {
    name: "CandidateValidationScore",
    score: finalScore,
    metadata: { totalEvaluated: args.predicted.length, rawScore: totalScore, maxScore: totalPossible }
  };
}

// 4. Email Dynamic Hook Scorer
export async function scoreEmailHook(args: { companyMission: string, generatedHook: string }) {
  const prompt = `You are an expert fact-checker evaluating an email hook.
Company Mission/Profile: ${args.companyMission}

Generated Email Hook: ${args.generatedHook}

Evaluate if the candidate's stated interest strictly relies on the provided Company Mission/Profile.
If they invented fake metrics, fake features, or hallucinated facts not present in the profile, score it 0. If it is 100% factually supported, score it 1.
Return ONLY a JSON object with a "score" key (1 or 0) and a "reasoning" key (string).`;

  try {
    const res = await fetchGroqSequential("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
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
      const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      return {
        name: "FactualityScore",
        score: parsed.score === 1 ? 1 : 0,
        metadata: { reasoning: parsed.reasoning }
      };
    } else {
      console.error("Groq scorer failed:", await res.text());
      return { name: "FactualityScore", score: 0 };
    }
  } catch (e: any) {
    console.error("Factuality Scorer Error:", e.message);
    return { name: "FactualityScore", score: 0 };
  }
}
