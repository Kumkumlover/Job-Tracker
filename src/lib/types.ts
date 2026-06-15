/* ── Shared types for the job-apply pipeline ── */

/** Payload from the webhook (form POST or JSON body) */
export interface ApplyPayload {
  company: string;
  job_title: string;
  jd?: string;
  company_reason?: string;
  recipient_name?: string;
  recipient_email?: string;
  my_summary?: string;
}

/** A single search result from Google CSE */
export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  score: number;
}

/** A ranked candidate from Gemini */
export interface RankedCandidate {
  name: string;
  profile_url: string;
  current_title: string;
  role_type: "hiring_manager" | "team_lead" | "recruiter_hr" | "other";
  confidence: number;
  reason: string;
  email?: string;
}

/** Output of the email discovery step */
export interface EmailCandidate {
  candidate_name: string;
  profile_url: string | null;
  email: string;
}

/** DNS-only email validation result */
export interface ValidationResult {
  email: string;
  syntax_ok: boolean;
  local_part_ok: boolean;
  local_reason: string | null;
  domain: string | null;
  domain_ok: boolean;
  mx_ok: boolean;
  mx_hosts: string[];
  provider: string | null;
  has_spf: boolean;
  spf_strict: boolean;
  has_dmarc: boolean;
  dmarc_policy: string | null;
  has_any_dkim: boolean;
  dkim_selectors_found: string[];
  disposable: boolean;
  role_based: boolean;
  is_free_provider: boolean;
  is_corporate: boolean;
  transactional_host: boolean;
  typo_suggestion: string | null;
  confidence: number;
  recruiting_score: number;
  reason: string;
}

export interface OutboundEmail {
  to_email: string;
  to_name: string;
  subject: string;
  html_body: string;
  company: string;
  job_title: string;
  profile_url?: string;
  senderName?: string;
}
