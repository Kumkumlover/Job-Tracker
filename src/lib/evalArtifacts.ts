import { z } from "zod";

export const SearchStrategySchema = z.object({
  department: z.string(),
  hiringManagerTitles: z.array(z.string()).optional(),
  hrTitles: z.array(z.string()).optional(),
  roleVariants: z.array(z.string()).optional(),
  deptKeywords: z.string(),
  companyModifier: z.string().optional()
});

export const RankedCandidateSchema = z.object({
  index: z.number(),
  role_type: z.enum(["hiring_manager", "team_lead", "recruiter_hr", "other", "any"]).catch("other"),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional()
});

export const TopCandidatesResponseSchema = z.object({
  topCandidates: z.array(RankedCandidateSchema)
});

export const MissionExtractSchema = z.object({
  companyMission: z.string(),
  matchedStrengths: z.string(),
});

export type SearchStrategyLLM = z.infer<typeof SearchStrategySchema>;
export type RankedCandidateLLM = z.infer<typeof RankedCandidateSchema>;
export type MissionExtractLLM = z.infer<typeof MissionExtractSchema>;
