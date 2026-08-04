import { z } from "zod";

export const CompanyProfileSchema = z.object({
  industry: z.string(),
  stage: z.string(),
  core_products: z.string(),
  mission_statement: z.string().optional()
});

export const SearchQueriesSchema = z.object({
  linkedin_queries: z.array(z.string()),
  google_queries: z.array(z.string()),
  serper_queries: z.array(z.string()),
  exa_query: z.string()
});

export const CandidateProfileSchema = z.object({
  name: z.string(),
  title: z.string(),
  department: z.string().optional(),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export const RankedCandidatesSchema = z.array(CandidateProfileSchema);

export const EvidenceSelectionSchema = z.array(z.object({
  project: z.string(),
  relevance_score: z.number().min(0).max(1),
  rationale: z.string().optional()
}));

export const EmailOutlineSchema = z.object({
  subject: z.string(),
  body: z.string(),
  bullets: z.array(z.string()).optional(),
  cta: z.string().optional()
});

export type CompanyProfileLLM = z.infer<typeof CompanyProfileSchema>;
export type SearchQueriesLLM = z.infer<typeof SearchQueriesSchema>;
export type CandidateProfileLLM = z.infer<typeof CandidateProfileSchema>;
export type EvidenceSelectionLLM = z.infer<typeof EvidenceSelectionSchema>;
export type EmailOutlineLLM = z.infer<typeof EmailOutlineSchema>;

export const SearchStrategySchema = z.object({
  department: z.string(),
  hiringManagerTitles: z.array(z.string()),
  deptKeywords: z.string().optional(),
  companyModifier: z.string().optional(),
  hrTitles: z.array(z.string()).optional()
});

export const TopCandidatesResponseSchema = z.object({
  topCandidates: z.array(z.object({
    index: z.number(),
    name: z.string().optional(),
    current_title: z.string().nullable().optional(),
    linkedin_url: z.string().optional(),
    confidence: z.number(),
    role_type: z.string().optional(),
    reason: z.string().optional(),
    is_ex_employee: z.boolean().optional()
  }))
});
