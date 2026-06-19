/**
 * Phase 2b: LLM ranks the top search results into candidates
 *
 * Replaces 2 n8n nodes: Rank candidates + Parse LLM output
 */

import { askJSON } from "../automation/llm";
import type { SearchResult, RankedCandidate } from "../types";
import { extractDeptKeywords, deptRelevanceScore, detectWrongDept } from "./dept-utils";

interface RankResponse {
  topCandidates: RankedCandidate[];
}

export async function rankCandidates(
  results: SearchResult[],
  company: string,
  jobTitle: string,
  jd?: string,
  excludeNames: string[] = [],
  llmDeptKeywords?: string
): Promise<RankedCandidate[]> {
  if (!results.length) return [];

  const excludeSet = new Set(excludeNames.map(n => n.trim().toLowerCase()));

  const companyLower = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const companyFirstWord = company.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const verified: RankedCandidate[] = [];
  
  // Use intelligent LLM keywords if available, otherwise fall back to heuristic
  const deptKeywords = llmDeptKeywords 
    ? extractDeptKeywords(llmDeptKeywords + " " + jobTitle)
    : extractDeptKeywords(jobTitle);


  for (const r of results) {
    const text = (r.title + " " + r.snippet).toLowerCase();
    
    // Check if the snippet or title contains the company name
    // (fuzzy match for company by taking first word if it's long)
    const companyFirstWord = company.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const worksAtCompany = text.includes(companyLower) || (companyFirstWord.length > 2 && text.includes(companyFirstWord));
    
    if (!worksAtCompany) continue;

    // Confirm the candidate actually works at the target company right now
    // (not just someone who mentions the company in a past role or endorsement)
    const safeComp = companyLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Smart ex-employee check: only look at the specific LinkedIn title section (separated by | or •) that contains the company
    const relevantSection = text.split(/[|•]/).find(part => part.includes(companyLower)) || text;
    const isExEmployee = new RegExp(`\\b(?:ex|former|previous)\\b`).test(relevantSection);
    if (isExEmployee) continue;

    // Strict confirmation they CURRENTLY work there
    const companyConfirmed =
      new RegExp(`\\b(?:at|@|building)\\s+${safeComp}\\b`).test(text) ||
      new RegExp(`\\b(?:founder|ceo|cpo|cto|director|co-founder)\\s+of\\s+${safeComp}\\b`).test(text) ||
      new RegExp(`(?:^|[\\s\\-])${safeComp}\\s*(?:[|\\-:]|$)`).test(text);


    const isFounder = /\b(founder|co-founder|ceo|chief executive)\b/.test(text);
    const isHR = /\b(human resources|talent acquisition|recruiter|hrbp|hr business partner|people partner|people ops|people operations)\b/.test(text);

    const relevance = deptRelevanceScore(text, deptKeywords);
    const wrongDeptLabel = detectWrongDept(text);

    let isValid = false;
    let confidence = 0.5;
    let reason = "";
    let role_type: "hiring_manager" | "team_lead" | "recruiter_hr" | "other" = "other";

    if (relevance > 0 && companyConfirmed) {
      // Strong dept match AND confirmed at company → high confidence
      isValid = true;
      confidence = 0.85;
      role_type = "hiring_manager";
      reason = `Matches target department keywords`;
    } else if (relevance > 0 && !companyConfirmed) {
      // Dept keywords match but company NOT confirmed — could be ex-employee or unrelated result
      isValid = true;
      confidence = 0.45;
      role_type = "other";
      reason = `Dept keyword match but company not confirmed in profile`;
    } else if (isFounder) {
      isValid = true;
      confidence = 0.8;
      role_type = "hiring_manager";
      reason = "Founder/CEO - always acceptable";
    } else if (isHR) {
      isValid = true;
      confidence = 0.6;
      role_type = "recruiter_hr";
      reason = "Recruiter/HR fallback";
    } else if (relevance === 0 && !wrongDeptLabel && /manager|lead|director|head|vp|chief/.test(text)) {
      isValid = true;
      confidence = 0.5;
      role_type = "hiring_manager";
      reason = "Generic manager - neutral department";
    } else if (wrongDeptLabel && /manager|lead|director|head|vp|chief/.test(text)) {
      isValid = true;
      confidence = 0.2;
      role_type = "hiring_manager";
      reason = `Wrong department (${wrongDeptLabel}) - last resort`;
    }

    if (isValid) {
      verified.push({
        name: r.title.split(/[-—|]/)[0].trim(),
        profile_url: (r as any).url || (r as any).link || '',
        current_title: r.snippet.substring(0, 50).trim(),
        role_type,
        confidence,
        reason: `Verified: ${reason}`
      });
    }
  }

  // Sort by confidence descending
  verified.sort((a, b) => b.confidence - a.confidence);

  // If we have strong dept matches (>=0.85), exclude HR (0.6) entirely—they're a last resort only
  const hasDeptMatches = verified.some(c => c.confidence >= 0.85);
  let finalCandidates = verified;
  if (hasDeptMatches) {
    finalCandidates = verified.filter(c => c.confidence >= 0.8);
  } else {
    // No strong dept matches—keep founders and HR, drop only confirmed wrong-dept people
    finalCandidates = verified.filter(c => c.confidence >= 0.5);
  }

  // Final safety net: strip anyone in the exclude list (catches cases where
  // query-level exclusions didn't work due to formatting differences)
  if (excludeSet.size > 0) {
    finalCandidates = finalCandidates.filter(c => !excludeSet.has(c.name.trim().toLowerCase()));
  }

  return finalCandidates.slice(0, 5);
}
