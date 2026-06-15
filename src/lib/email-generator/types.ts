/**
 * Email Generator — Types
 */

export interface VaultItem {
  id: string;
  title: string;
  content: string;
  type: "text" | "link" | "image" | "pdf";
  vaultType: "evidence" | "inspiration";
  timestamp: number;
}

export interface ResearchProblem {
  id: string;
  title: string;
  problem: string;
  hypothesis: string;
  pmGoal: string;
  hook: string;
  citation: string;
  companyMission: string;
  matchedStrengths: string;
  linkedinHook: string;
  speculativePitch: string;
}

export interface ResearchInput {
  companyName: string;
  industry: string;
  role: string;
  contactName?: string;
  leadUrl?: string;
  companyWebsite?: string;
  jobDescription?: string;
}

export interface ResearchResult {
  problems: ResearchProblem[];
}

export type OutputType = "Cold Email" | "Startup Pitch" | "Follow-up" | "LinkedIn DM";
