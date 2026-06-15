export const PLATFORMS = [
  "linkedin",
  "naukri",
  "foundit",
  "instahyre",
  "indeed",
  "email",
  "manual",
  "other",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  naukri: "Naukri",
  foundit: "Foundit",
  instahyre: "Instahyre",
  indeed: "Indeed",
  email: "Email",
  manual: "Manual",
  other: "Other",
};

export const TOUCHPOINT_TYPES = [
  "careers_page",
  "email_to_hr",
  "linkedin_dm",
  "referral",
  "recruiter_email",
  "other",
] as const;

export const TOUCHPOINT_LABELS: Record<string, string> = {
  careers_page: "Careers Page",
  email_to_hr: "Email to HR",
  linkedin_dm: "LinkedIn DM",
  referral: "Referral",
  recruiter_email: "Recruiter Email",
  other: "Other",
};

export const LOCATION_TYPES = ["remote", "onsite", "hybrid"] as const;

export const PROPERTY_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "boolean",
  "url",
] as const;

export const DEFAULT_STAGES = [
  { name: "Applied", slug: "applied", color: "#a1a1aa", sortOrder: 0 },
  { name: "Acknowledged", slug: "acknowledged", color: "#d4d4d8", sortOrder: 1 },
  { name: "Phone Screen", slug: "phone_screen", color: "#fcd34d", sortOrder: 2 },
  { name: "Assignment", slug: "assignment", color: "#fbbf24", sortOrder: 3 },
  { name: "Interview 1", slug: "interview_1", color: "#34d399", sortOrder: 4 },
  { name: "Interview 2", slug: "interview_2", color: "#10b981", sortOrder: 5 },
  { name: "Interview 3", slug: "interview_3", color: "#059669", sortOrder: 6 },
  { name: "Offer", slug: "offer", color: "#00d992", sortOrder: 7 },
  { name: "Rejected", slug: "rejected", color: "#ef4444", sortOrder: 8 },
  { name: "Withdrawn", slug: "withdrawn", color: "#71717a", sortOrder: 9 },
];
