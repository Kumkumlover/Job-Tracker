import { google } from "googleapis";
import { prisma } from "./prisma";
import { normalizeForDedup } from "./utils";

// ── Domains & Filters ──────────────────────────────────────────

// Job portal domains — emails FROM these are alerts/notifications, not real acks
const JOB_PORTAL_DOMAINS = [
  "naukri.com",
  "foundit.com",
  "monster.com",
  "indeed.com",
  "instahyre.com",
  "ambitionbox.com",
  "linkedin.com",
  "hirist.com",
  "shine.com",
  "iimjobs.com",
  "cutshort.io",
  "angellist.com",
  "wellfound.com",
  "apna.co",
  "hirect.in",
  "bigshyft.com",
];

// ATS / HR-platform domains — emails come from these on behalf of real companies
// We should use the domain name or subject to extract the actual company
const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "icims.com",
  "workday.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "breezy.hr",
  "freshteam.com",
  "zohorecruit.com",
  "recruitee.com",
  "bamboohr.com",
  "myworkdayjobs.com",
  "taleo.net",
  "successfactors.com",
  "keka.com",
  "kekamail.com",
  "darwinbox.com",
  "greythr.com",
  "springrecruit.com",
  "viazohorecruit.in",
  "talent.icims.com",
];

// Generic email domains — can't derive company from these
const GENERIC_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "protonmail.com",
  "rediffmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "ymail.com",
  "googlemail.com",
];

// Subject patterns that indicate this is a JOB ALERT, not an acknowledgment
const ALERT_SUBJECT_PATTERNS = [
  /job\s*alert/i,
  /new\s*jobs?\s*(for|matching|near|in)\b/i,
  /jobs?\s*recommended/i,
  /\d+\s*new\s*(jobs?|openings?|opportunities)/i,
  /openings?\s*(for|matching|near|in)\b/i,
  /jobs?\s*you\s*might\s*(like|be\s*interested)/i,
  /career\s*opportunities/i,
  /get\s*shortlisted/i,
  /profile\s*(views?|visitors?|update)/i,
  /recruiter\s*(viewed|looked|searched)/i,
  /who\s*viewed\s*your\s*profile/i,
  /resume\s*(score|tips|update|enhance)/i,
  /suggested\s*(jobs?|roles?)/i,
  /daily\s*digest/i,
  /weekly\s*(digest|summary|jobs?)/i,
  /top\s*\d+\s*(jobs?|companies)/i,
  /similar\s*jobs?/i,
  /based\s*on\s*your\s*(profile|search|interest)/i,
  /companies?\s*(are\s*)?hiring/i,
  /trending\s*(jobs?|roles?)/i,
  /don'?t\s*miss/i,
  /hiring\s*challenge/i,
  /\bfree\s*(webinar|course|session)/i,
];

// Subject patterns that indicate an APPLICATION-RELATED email
const APP_SUBJECT_PATTERNS = [
  /application\s*(for|to)\s+/i,
  /received\s*your\s*application/i,
  /thank\s*you\s*for\s*(applying|your\s*application|your\s*interest)/i,
  /application\s*(received|acknowledged|confirmed|submitted|status|update)/i,
  /successfully\s*(applied|submitted)/i,
  /we\s*(have\s*)?received\s*your/i,
  /your\s*application\s*(has\s*been|was)\s*(received|submitted|reviewed)/i,
  /applied\s*(for|to)\s+/i,
  /application\s*was\s*sent\s*to\s+/i,
  /your\s*application\s*.*\s*was\s*sent/i,
  /confirmation\s*of\s*(your\s*)?(application|submission)/i,
  /update\s*on\s*your\s*application/i,
  /regarding\s*your\s*application/i,
  /job\s*application\s*status/i,
  /application\s*update/i,
  /thank\s*you\s*for\s*your\s*application/i,
  // Status update emails
  /shortlisted/i,
  /you('ve| have)\s*been\s*selected/i,
  /moving\s*(forward|ahead)\s*with\s*your/i,
  /next\s*steps?\s*(for|in|with)\s*your/i,
  /interview\s*(invite|invitation|scheduled|confirmation|round)/i,
  /assignment\s*(received|submitted|details|task)/i,
  /assessment\s*(invite|invitation|link|details)/i,
  /we'?d\s*like\s*to\s*invite\s*you/i,
  /congratulations/i,
  /offer\s*(letter|details|confirmation|extended)/i,
  // Rejection emails
  /regret\s*to\s*inform/i,
  /unfortunately/i,
  /not\s*(be\s*)?moving\s*forward/i,
  /decided\s*not\s*to\s*proceed/i,
  /other\s*candidates/i,
  /not\s*been\s*selected/i,
  /will\s*not\s*be\s*(proceeding|moving)/i,
  /unable\s*to\s*offer/i,
  /position\s*has\s*been\s*filled/i,
  /after\s*careful\s*(review|consideration)/i,
];

// ── Stage Detection ────────────────────────────────────────────

// Stage priority order — higher index = later in pipeline
const STAGE_ORDER: Record<string, number> = {
  applied: 0,
  acknowledged: 1,
  phone_screen: 2,
  assignment: 3,
  interview_1: 4,
  interview_2: 5,
  interview_3: 6,
  offer: 7,
  rejected: 8,
  withdrawn: 9,
};

// Detect the stage/status from an email subject
function detectStageFromSubject(subject: string): string | null {
  const s = subject.toLowerCase();

  // Rejection — check first as rejection can happen at any stage
  if (
    /regret\s*to\s*inform/i.test(s) ||
    /unfortunately/i.test(s) ||
    /not\s*(be\s*)?moving\s*forward/i.test(s) ||
    /decided\s*not\s*to\s*proceed/i.test(s) ||
    /other\s*candidates/i.test(s) ||
    /not\s*been\s*selected/i.test(s) ||
    /will\s*not\s*be\s*(proceeding|moving)/i.test(s) ||
    /unable\s*to\s*offer/i.test(s) ||
    /position\s*has\s*been\s*filled/i.test(s) ||
    /after\s*careful\s*(review|consideration)/i.test(s) ||
    /reject(ed|ion)/i.test(s)
  ) {
    return "rejected";
  }

  // Offer
  if (
    /offer\s*(letter|details|confirmation|extended)/i.test(s) ||
    /congratulations.*offer/i.test(s) ||
    /pleased\s*to\s*offer/i.test(s) ||
    /extend\s*(an|you)\s*offer/i.test(s)
  ) {
    return "offer";
  }

  // Interview
  if (
    /interview\s*(invite|invitation|scheduled|confirmation|round|call)/i.test(s) ||
    /we'?d\s*like\s*to\s*invite\s*you\s*(for|to)\s*(an?\s*)?interview/i.test(s) ||
    /schedule\s*(an?\s*)?(interview|call|meeting)/i.test(s) ||
    /round\s*[123]\s*(interview)?/i.test(s) ||
    /technical\s*(interview|round|discussion)/i.test(s) ||
    /interview\s*(with|at)\s/i.test(s)
  ) {
    // Try to detect which interview round
    if (/round\s*3|third\s*round|interview\s*3/i.test(s)) return "interview_3";
    if (/round\s*2|second\s*round|interview\s*2/i.test(s)) return "interview_2";
    return "interview_1";
  }

  // Assignment / Assessment
  if (
    /assignment\s*(received|submitted|details|task|sent|due)/i.test(s) ||
    /assessment\s*(invite|invitation|link|details|task)/i.test(s) ||
    /take\s*home\s*(assignment|task|test)/i.test(s) ||
    /coding\s*(challenge|test|assessment)/i.test(s) ||
    /complete\s*(the|this|your)\s*(assignment|assessment|task|test)/i.test(s) ||
    /received\s*your\s*assignment/i.test(s) ||
    /submitted\s*(your\s*)?(assignment|assessment)/i.test(s) ||
    /product\s*assignment/i.test(s) ||
    /next\s*step.*assignment/i.test(s) ||
    /reminder.*assignment/i.test(s)
  ) {
    return "assignment";
  }

  // Phone Screen / Shortlisted
  if (
    /shortlisted/i.test(s) ||
    /you('ve| have)\s*been\s*selected/i.test(s) ||
    /phone\s*screen/i.test(s) ||
    /screening\s*(call|round|interview)/i.test(s) ||
    /initial\s*(call|screening|conversation)/i.test(s) ||
    /moving\s*(forward|ahead)\s*with\s*your/i.test(s) ||
    /next\s*steps?\s*(for|in|with)\s*your/i.test(s) ||
    /like\s*to\s*(schedule|connect|discuss)/i.test(s)
  ) {
    return "phone_screen";
  }

  // Acknowledged — application received/confirmed (NOT generic status updates)
  if (
    /application\s*(received|acknowledged|confirmed|submitted)/i.test(s) ||
    /application\s+for\s+.+\s+received/i.test(s) ||
    /received\s*your\s*application/i.test(s) ||
    /thank\s*you\s*for\s*(applying|your\s*application)/i.test(s) ||
    /successfully\s*(applied|submitted)/i.test(s) ||
    /we\s*(have\s*)?received\s*your/i.test(s)
  ) {
    return "acknowledged";
  }

  return null;
}

// Determine if a new detected stage should update the current status
function shouldUpdateStatus(currentStatus: string, newStage: string): boolean {
  // Rejection and withdrawal always apply
  if (newStage === "rejected" || newStage === "withdrawn") return true;

  const currentOrder = STAGE_ORDER[currentStatus] ?? -1;
  const newOrder = STAGE_ORDER[newStage] ?? -1;

  // Only advance forward (don't go backwards)
  // But also don't overwrite rejected/withdrawn with earlier stages
  if (currentStatus === "rejected" || currentStatus === "withdrawn") return false;

  return newOrder > currentOrder;
}

// ── Company & Role Extraction ──────────────────────────────────

function domainMatches(domain: string, list: string[]): boolean {
  // Exact match or subdomain match (e.g., "talent.icims.com" matches "icims.com")
  return list.some(
    (entry) => domain === entry || domain.endsWith("." + entry)
  );
}

function isJobPortalDomain(domain: string): boolean {
  return domainMatches(domain, JOB_PORTAL_DOMAINS);
}

function isATSDomain(domain: string): boolean {
  return domainMatches(domain, ATS_DOMAINS);
}

function isGenericDomain(domain: string): boolean {
  return domainMatches(domain, GENERIC_EMAIL_DOMAINS);
}

function isAlertEmail(subject: string): boolean {
  return ALERT_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

function isAppRelatedEmail(subject: string): boolean {
  return APP_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

// Check if a string looks like a person's name rather than a company
function looksLikePersonName(name: string): boolean {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/);

  // Single word — could be a first name. Check if it's title-cased and short
  if (words.length === 1) {
    // Single short capitalized word with no company indicators
    if (/^[A-Z][a-z]{2,12}$/.test(trimmed)) return true;
    return false;
  }

  // 2-3 words, each title-cased like "Sagar Pal" or "Ishita Sen"
  if (words.length >= 2 && words.length <= 3) {
    const allNameLike = words.every((w) => /^[A-Z][a-z]{1,15}$/.test(w));
    const hasCompanyIndicator =
      /\b(inc|ltd|llc|corp|pvt|private|limited|solutions?|tech|digital|software|group|labs?|studio|media|systems?|games?|works?|io)\b/i.test(
        trimmed
      );
    return allNameLike && !hasCompanyIndicator;
  }

  return false;
}

// Convert domain to company name: "lilagames.com" → "Lilagames" → "Lila Games"
function companyFromDomain(domain: string): string {
  const name = domain.split(".")[0];
  // Try to split camelCase or known compound names
  const spaced = name
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase
    .replace(/-/g, " ") // kebab-case
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return spaced;
}

function extractCompanyFromEmail(
  from: string,
  domain: string,
  subject: string
): string {
  // If from a job portal domain, skip
  if (isJobPortalDomain(domain)) return "";
  // If from a generic email domain, skip
  if (isGenericDomain(domain)) return "";

  // Try display name: "Google Careers <noreply@google.com>"
  const displayNameMatch = from.match(/^"?([^"<]+)"?\s*</);
  if (displayNameMatch) {
    let displayName = displayNameMatch[1].trim();

    // Remove "Alerts" suffix
    displayName = displayName.replace(/\s*alerts?\s*$/i, "").trim();

    // Handle "Name from PortalName" — skip entirely
    const fromPortalMatch = displayName.match(/^.+?\s+from\s+(.+)$/i);
    if (fromPortalMatch) {
      const portal = fromPortalMatch[1].trim().toLowerCase();
      if (
        JOB_PORTAL_DOMAINS.some((p) => portal.includes(p.split(".")[0]))
      ) {
        return ""; // "Myra from foundit" → skip
      }
    }

    // Handle "CompanyName Hiring team" / "CompanyName Careers" etc.
    // Check this BEFORE the person-name check so "KAPTURE CX Hiring team" works
    const hiringMatch = displayName.match(
      /^(.+?)\s+(hiring\s*team|hiring|recruitment\s*team|recruitment|careers?|talent\s*team|talent|hr\s*team|hr)\s*$/i
    );
    if (hiringMatch) {
      return hiringMatch[1].trim();
    }

    // If display name looks like a person's name, prefer domain or subject
    if (looksLikePersonName(displayName)) {
      // For ATS domains (kekamail, icims, zohorecruit), try subject first
      if (isATSDomain(domain)) {
        return extractCompanyFromSubject(subject);
      }
      // For real company domains, use domain name
      return companyFromDomain(domain);
    }

    // Use display name as company (clean common suffixes)
    const cleaned = displayName
      .replace(
        /\s*(careers?|recruiting|recruitment|hr|talent|team|jobs?|hiring|notifications?|no-?reply)\s*$/i,
        ""
      )
      .trim();

    if (cleaned.length > 1 && !looksLikePersonName(cleaned)) return cleaned;
  }

  // Fall back to domain name for real company domains
  if (!isATSDomain(domain)) {
    return companyFromDomain(domain);
  }

  // For ATS domains, try subject line
  return extractCompanyFromSubject(subject);
}

// Extract company from subject: "Application for PM at Google" → "Google"
function extractCompanyFromSubject(subject: string): string {
  const patterns = [
    // "... at Company Name" or "... at Company Name!"
    /\bat\s+([A-Z][\w\s&.-]+?)(?:\s*[-–—|!.,]|\s*$)/,
    // "... to Company Name" (e.g., "application to CheQ Digital")
    /application\s+to\s+([A-Z][\w\s&.-]+?)(?:\s*[-–—|!.,]|\s*$)/i,
    // "... with Company Name"
    /\bwith\s+([A-Z][\w\s&.-]+?)(?:\s*[-–—|!.,]|\s*$)/,
    // "... from Company Name"
    /\bfrom\s+([A-Z][\w\s&.-]+?)(?:\s*[-–—|!.,]|\s*$)/,
    // "Thank You for Applying to Company Name"
    /applying\s+to\s+([A-Z][\w\s&.-]+?)(?:\s*[-–—|!.,]|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match && match[1].trim().length > 1) {
      // Clean legal suffixes (full words only)
      return match[1]
        .trim()
        .replace(/\s+(Pvt\.?\s*Ltd\.?|Private\s+Limited|Inc\.?|LLC|Corporation|Corp\.?|LLP)\s*/gi, "")
        .trim();
    }
  }
  return "";
}

// Known roles — used to validate extracted roles
const KNOWN_ROLE_KEYWORDS = [
  "product manager",
  "product management",
  "associate product manager",
  "product intern",
  "founder's office",
  "founders office",
  "apm",
  "apprentice",
  "senior product manager",
  "junior product manager",
  "product analyst",
  "business analyst",
  "program manager",
  "project manager",
  "management trainee",
  "software engineer",
  "software developer",
  "frontend",
  "backend",
  "full stack",
  "fullstack",
  "data analyst",
  "data scientist",
  "intern",
  "trainee",
  "associate",
  "manager",
  "analyst",
  "engineer",
  "developer",
  "designer",
  "consultant",
  "executive",
  "coordinator",
  "specialist",
  "lead",
  "head",
  "director",
  "officer",
  "ase",
];

function extractRoleFromSubject(subject: string): string {
  // Remove noise phrases
  const cleaned = subject
    .replace(/received,?\s*thank\s*you!?/gi, "")
    .replace(/\s*[-–—|]\s*thank\s*you.*/i, "")
    .replace(/\bthank\s*you\b.*/i, "")
    .replace(/\breceived\b/gi, "")
    .replace(/assignment\s*(received|submitted)/gi, "")
    .replace(/application\s*(received|status|update|confirmed)/gi, "")
    .trim();

  // Try specific extraction patterns
  const patterns = [
    // "Application for Associate Product Manager at Google"
    /application\s+(?:for|to)\s+(?:the\s+)?(?:position\s+(?:of\s+)?)?(.+?)(?:\s+(?:at|@|with)\s+|\s*[-–—|]\s*|\s*$)/i,
    // "Your application - Associate Product Manager"
    /your\s+application\s*[-–—:]\s*(.+?)(?:\s+(?:at|@|with)\s+|\s*[-–—|]\s*|\s*$)/i,
    // "Applied for Associate Product Manager"
    /applied\s+(?:for|to)\s+(?:the\s+)?(.+?)(?:\s+(?:at|@|with)\s+|\s*$)/i,
    // "Shortlisted for Associate Product Manager"
    /shortlisted\s+for\s+(?:the\s+)?(?:position\s+(?:of\s+)?)?(.+?)(?:\s+(?:at|@|with)\s+|\s*[-–—|]\s*|\s*$)/i,
    // "Interview for Associate Product Manager"
    /interview\s+(?:for|:)\s+(?:the\s+)?(.+?)(?:\s+(?:at|@|with)\s+|\s*[-–—|]\s*|\s*$)/i,
    // "Associate Product Manager - Application Received"
    /^(.+?)\s*[-–—|]\s*(?:application|your|we|shortlisted|interview|assignment|assessment)\b/i,
    // "Role: Associate Product Manager"
    /(?:role|position|opening)\s*:\s*(.+?)(?:\s*[-–—|]\s*|\s*$)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const role = match[1]
        .trim()
        .replace(/\s*[-–—|,]\s*$/, "")
        .trim();

      // Validate: must contain at least one known role keyword
      const lower = role.toLowerCase();
      const hasRoleKeyword = KNOWN_ROLE_KEYWORDS.some((kw) =>
        lower.includes(kw)
      );
      if (hasRoleKeyword && role.length > 2 && role.length < 100) {
        return role;
      }
    }
  }

  // Last resort: scan for known exact role phrases in the subject
  const lowerSubject = cleaned.toLowerCase();
  const exactRoles = [
    "associate product manager",
    "product manager",
    "product intern",
    "founder's office",
    "founders office",
    "senior product manager",
    "management trainee",
    "business analyst",
    "product analyst",
    "data analyst",
    "software engineer",
    "software developer",
  ];
  for (const role of exactRoles) {
    if (lowerSubject.includes(role)) {
      const idx = lowerSubject.indexOf(role);
      return cleaned
        .substring(idx, idx + role.length)
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return "";
}

// ── Types & Helpers ────────────────────────────────────────────

interface ParsedEmail {
  company: string;
  role: string;
  stage: string | null; // detected stage from subject
  date: Date;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  isOutbound: boolean;
}

function getHeader(
  headers: { name?: string | null; value?: string | null }[],
  name: string
): string {
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

// ── Gmail Client ───────────────────────────────────────────────

export async function getGmailClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token) {
    throw new Error("No Google account linked");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date
            ? Math.floor(tokens.expiry_date / 1000)
            : null,
        },
      });
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function getGmailClientForLinked(linkedId: string) {
  const linked = await prisma.linkedGmailAccount.findUnique({ where: { id: linkedId } });
  if (!linked?.accessToken) throw new Error("No access token for linked account");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: linked.accessToken,
    refresh_token: linked.refreshToken,
  });
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await prisma.linkedGmailAccount.update({
        where: { id: linkedId },
        data: {
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        },
      });
    }
  });
  return { gmail: google.gmail({ version: "v1", auth: oauth2Client }), email: linked.email };
}

type SyncResults = {
  applicationsCreated: number;
  applicationsUpdated: number;
  touchpointsAdded: number;
  emailsProcessed: number;
  emailsSkipped?: number;
  gmailIdsFound?: number;
  gmailSearchErrors?: number;
};

async function processEmailList(
  userId: string,
  parsedEmails: ParsedEmail[],
  results: SyncResults,
  gmailAccount?: string,  // email address of the account this email came from
  cachedApps?: CachedApp[]
) {
  // Load apps once if not pre-supplied
  const apps = cachedApps ?? await prisma.application.findMany({
    where: { userId },
    select: { id: true, company: true, role: true, status: true, emailThreadId: true, followUpDate: true },
  });

  for (const parsed of parsedEmails) {
    try {
      const match = matchToApplicationCached(apps, parsed);
      if (match) {
        const existingTouchpoint = await prisma.touchpoint.findFirst({
          where: { emailMessageId: parsed.messageId },
        });
        if (!existingTouchpoint) {
          await prisma.touchpoint.create({
            data: {
              applicationId: match.id,
              type: parsed.isOutbound ? "email_to_hr" : "recruiter_email",
              source: "gmail_scan",
              date: parsed.date,
              emailMessageId: parsed.messageId,
              metadata: {
                subject: parsed.subject,
                from: parsed.from,
                detectedStage: parsed.stage || undefined,
                gmailAccount: gmailAccount || undefined,
              },
            },
          });
          results.touchpointsAdded++;
          if (!match.emailThreadId && parsed.threadId) {
            await prisma.application.update({
              where: { id: match.id },
              data: { emailThreadId: parsed.threadId },
            });
          }
          if (parsed.stage && shouldUpdateStatus(match.status, parsed.stage)) {
            await prisma.application.update({
              where: { id: match.id },
              data: { status: parsed.stage },
            });
            results.applicationsUpdated++;
            match.status = parsed.stage;
          }
          if (parsed.isOutbound && !match.followUpDate) {
            const followUp = new Date(parsed.date);
            followUp.setDate(followUp.getDate() + 3);
            await prisma.application.update({
              where: { id: match.id },
              data: { followUpDate: followUp },
            });
          }
          if (parsed.role && match.role === "Unknown Role") {
            await prisma.application.update({
              where: { id: match.id },
              data: { role: parsed.role },
            });
          }
        } else if (existingTouchpoint) {
          // Touchpoint already exists — patch gmailAccount if missing
          if (gmailAccount) {
            const meta = (existingTouchpoint.metadata as Record<string, string> | null) || {};
            if (!meta.gmailAccount) {
              await prisma.touchpoint.update({
                where: { id: existingTouchpoint.id },
                data: { metadata: { ...meta, gmailAccount } },
              });
            }
          }
          // Re-evaluate status even for existing touchpoints
          // (e.g. rejection email was saved but status never updated)
          if (parsed.stage && shouldUpdateStatus(match.status, parsed.stage)) {
            await prisma.application.update({
              where: { id: match.id },
              data: { status: parsed.stage },
            });
            results.applicationsUpdated++;
            match.status = parsed.stage;
          }
        }
      } else if (parsed.company) {
        const role = parsed.role || "Unknown Role";
        if (parsed.role || parsed.stage || parsed.isOutbound) {
          try {
            const followUpDate = parsed.isOutbound
              ? new Date(parsed.date.getTime() + 3 * 24 * 60 * 60 * 1000)
              : null;
            const newApp = await prisma.application.create({
              data: {
                userId,
                company: parsed.company,
                role,
                platform: "email",
                status: parsed.stage || (parsed.isOutbound ? "applied" : "acknowledged"),
                dateApplied: parsed.date,
                emailThreadId: parsed.threadId || null,
                followUpDate,
              },
            });
            results.applicationsCreated++;
            // Also create a touchpoint for the triggering email
            await prisma.touchpoint.create({
              data: {
                applicationId: newApp.id,
                type: parsed.isOutbound ? "email_to_hr" : "recruiter_email",
                source: "gmail_scan",
                date: parsed.date,
                emailMessageId: parsed.messageId,
                metadata: {
                  subject: parsed.subject,
                  from: parsed.from,
                  detectedStage: parsed.stage || undefined,
                  gmailAccount: gmailAccount || undefined,
                },
              },
            });
            results.touchpointsAdded++;
            // Add the new app to the local cache so later emails for it can match
            apps.push({
              id: newApp.id,
              company: parsed.company,
              role,
              status: parsed.stage || (parsed.isOutbound ? "applied" : "acknowledged"),
              emailThreadId: parsed.threadId || null,
              followUpDate,
            });
          } catch {
            // Duplicate application — skip
          }
        }
      }
    } catch {
      // Skip individual errors
    }
  }
}

export async function searchEmails(
  gmail: ReturnType<typeof google.gmail>,
  query: string,
  maxResults = 100
): Promise<string[]> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(maxResults - messageIds.length, 50),
      pageToken,
    });

    if (res.data.messages) {
      messageIds.push(...res.data.messages.map((m) => m.id!));
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken && messageIds.length < maxResults);

  return messageIds;
}

// ── Email Parsing ──────────────────────────────────────────────

export async function parseEmail(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
  userEmail?: string
): Promise<ParsedEmail | null> {
  // First fetch with metadata to do quick filtering
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = res.data.payload?.headers || [];
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const subject = getHeader(headers, "Subject");
  const dateStr = getHeader(headers, "Date");

  // FILTER: Skip job alert emails
  if (isAlertEmail(subject)) return null;

  // Extract sender domain
  const emailMatch = from.match(/@([\w.-]+)/);
  const domain = emailMatch ? emailMatch[1] : "";

  // Determine if outbound
  const isOutbound = userEmail
    ? from.toLowerCase().includes(userEmail.toLowerCase())
    : false;

  // FILTER: If from a job portal, skip UNLESS the subject is application-related
  // (e.g. LinkedIn sends "Your application was sent to Rooter.gg" which IS relevant)
  if (!isOutbound && isJobPortalDomain(domain) && !isAppRelatedEmail(subject)) return null;

  // FILTER: Must be application-related (check subject OR if from known ATS domain)
  if (!isOutbound && !isAppRelatedEmail(subject) && !isATSDomain(domain)) return null;

  // Extract plain text body — use snippet as fallback
  const bodyText = extractBodyText(res.data.payload) || res.data.snippet || "";

  // For outbound emails, extract company from recipient domain
  let company: string;
  if (isOutbound) {
    const toMatch = to.match(/@([\w.-]+)/);
    const toDomain = toMatch ? toMatch[1] : "";
    if (isGenericDomain(toDomain) || isJobPortalDomain(toDomain)) return null;
    // For outbound, use domain name directly (recipient address isn't a company name)
    company = companyFromDomain(toDomain);
  } else {
    company = extractCompanyFromEmail(from, domain, subject);
    // For job portal emails that passed the app-related filter,
    // extract company from subject (e.g. "Your application was sent to Rooter.gg")
    if (!company && isJobPortalDomain(domain)) {
      // "Your application was sent to Rooter.gg"
      const sentTo = subject.match(/(?:sent|submitted|applied)\s+to\s+(.+?)(?:\s*[!.|]|$)/i);
      if (sentTo) company = sentTo[1].trim();
      // "Your application to [Role] at Rooter.gg" — match the LAST "at Company"
      // Use reverse-search: find everything after the final " at "
      if (!company) {
        const lastAt = subject.lastIndexOf(" at ");
        if (lastAt !== -1) {
          const afterAt = subject.slice(lastAt + 4).trim().replace(/[!.|,].*$/, "").trim();
          // Only use if it looks like a company (not too long, starts uppercase, no common words)
          if (afterAt && afterAt.length > 1 && afterAt.length < 60 && /^[A-Z]/i.test(afterAt)) {
            company = afterAt;
          }
        }
      }
      // "Your update from Rooter.gg"
      if (!company) {
        const fromCompany = subject.match(/(?:update|response|news)\s+from\s+(.+?)(?:\s*[!.|]|$)/i);
        if (fromCompany) company = fromCompany[1].trim();
      }
    }
  }
  let role = extractRoleFromSubject(subject);
  let stageFromSubject = detectStageFromSubject(subject);

  // For outbound, try to resolve "APM" in subject to full role name
  if (isOutbound && !role) {
    const subjLower = subject.toLowerCase();
    if (subjLower.includes("apm")) role = "Associate Product Manager";
    else if (subjLower.includes("pm ") || subjLower.includes("pm-") || /\bpm\b/.test(subjLower)) role = "Product Manager";
  }

  // Parse body for stage (always) and role (only for inbound — outbound body is cover letter, not role)
  let stageFromBody: string | null = null;
  if (bodyText) {
    if (!role && !isOutbound) {
      role = extractRoleFromBody(bodyText);
    }
    stageFromBody = detectStageFromBody(bodyText);
  }

  // Body stage wins over subject stage if body detected something more specific
  // (e.g., subject says "acknowledged" but body says "rejected")
  let stage: string | null;
  if (stageFromBody && stageFromSubject) {
    // Use whichever is more advanced in the pipeline
    const bodyOrder = STAGE_ORDER[stageFromBody] ?? -1;
    const subjOrder = STAGE_ORDER[stageFromSubject] ?? -1;
    stage = bodyOrder >= subjOrder ? stageFromBody : stageFromSubject;
  } else {
    stage = stageFromBody || stageFromSubject;
  }

  // Must have a company
  if (!company) return null;

  return {
    company,
    role,
    stage,
    date: dateStr ? new Date(dateStr) : new Date(),
    threadId: res.data.threadId || "",
    messageId: res.data.id || messageId,
    subject,
    from,
    isOutbound,
  };
}

// ── Body Text Extraction ───────────────────────────────────────

// Recursively extract plain text from Gmail message payload
function extractBodyText(
  payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] }> | null } | undefined | null
): string {
  if (!payload) return "";

  // Direct text/plain body
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — look through parts
  if (payload.parts) {
    // Prefer text/plain over text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to text/html, strip tags
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return stripHtml(html);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const text = extractBodyText(part as typeof payload);
        if (text) return text;
      }
    }
  }

  // Single-part HTML
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return "";
}

function decodeBase64Url(data: string): string {
  // Gmail uses URL-safe base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(p|div|tr|li|h[1-6]|td|th|blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Body-based Extraction ──────────────────────────────────────

function extractRoleFromBody(body: string): string {
  // Look for role mentions in the body text
  // Common patterns:
  // "apply for the Associate Product Manager (APM) position"
  // "application to Associate Product Manager"
  // "your application for Senior Product Manager"
  // "the position of Associate Product Manager"

  const patterns = [
    /(?:apply|applied|application)\s+(?:for|to)\s+(?:(?:the|our|an?)\s+)?(?:position\s+(?:of\s+)?)?(.+?)(?:\s+(?:position|role|at|with)\b|\s*[.,]|\s*$)/im,
    /(?:position|role)\s+(?:of|:)\s*(.+?)(?:\s*[.,]|\s*$)/im,
    /(?:interest\s+in|applying\s+to)\s+(?:the\s+)?(.+?)(?:\s+(?:position|role|at|with)\b|\s*[.,]|\s*$)/im,
    // "move forward with your application to Associate Product Manager"
    /application\s+to\s+(.+?)(?:\s*[.,]|\s*$)/im,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/\s*[.,;:!?]\s*$/, "").trim();
      // Validate against known role keywords
      const lower = candidate.toLowerCase();
      const hasRoleKeyword = KNOWN_ROLE_KEYWORDS.some((kw) => lower.includes(kw));
      if (hasRoleKeyword && candidate.length > 2 && candidate.length < 80) {
        // Clean up: remove parenthetical abbreviations at end, trailing noise
        return candidate
          .replace(/\s*\([^)]*\)\s*$/, "")
          .trim();
      }
    }
  }

  // Last resort: scan for exact known role phrases
  const lowerBody = body.toLowerCase();
  const exactRoles = [
    "associate product manager",
    "product manager",
    "product intern",
    "founder's office",
    "founders office",
    "senior product manager",
    "management trainee",
    "business analyst",
    "product analyst",
    "data analyst",
    "software engineer",
    "software developer",
  ];
  for (const role of exactRoles) {
    const idx = lowerBody.indexOf(role);
    if (idx !== -1) {
      // Return with proper casing from original text
      return body
        .substring(idx, idx + role.length)
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return "";
}

function detectStageFromBody(body: string): string | null {
  const s = body.toLowerCase();

  // Rejection signals
  if (
    /regret\s*to\s*inform/i.test(s) ||
    /not\s*to\s*move\s*forward/i.test(s) ||
    /decided\s*not\s*to\s*(move\s*forward|proceed)/i.test(s) ||
    /not\s*been\s*selected/i.test(s) ||
    /will\s*not\s*be\s*(proceeding|moving)/i.test(s) ||
    /unable\s*to\s*(offer|move\s*forward)/i.test(s) ||
    /unfortunately.*not/i.test(s) ||
    /move[d]?\s*forward\s*with\s*(?:an\s*)?other\s*candidate/i.test(s) ||
    /move[d]?\s*forward\s*with\s*another\s*candidate/i.test(s) ||
    /pursue\s*other\s*candidates/i.test(s) ||
    /decided\s*to\s*go\s*with/i.test(s) ||
    /another\s*candidate\s*who\s*more\s*closely\s*matches/i.test(s) ||
    /not\s*(?:be\s*)?(?:able\s*to\s*)?mov(?:e|ing)\s*forward\s*with\s*your/i.test(s)
  ) {
    return "rejected";
  }

  // Offer signals
  if (
    /pleased\s*to\s*(offer|extend)/i.test(s) ||
    /offer\s*(letter|of\s*employment)/i.test(s) ||
    /extend\s*(?:you\s*)?(?:an?\s*)?offer/i.test(s) ||
    /congratulations.*(?:join|offer|selected)/i.test(s)
  ) {
    return "offer";
  }

  // Interview signals
  if (
    /schedule\s*(?:an?\s*)?(?:interview|call|meeting)/i.test(s) ||
    /invite\s*you\s*(?:for|to)\s*(?:an?\s*)?interview/i.test(s) ||
    /like\s*to\s*(?:schedule|set\s*up)\s*(?:an?\s*)?interview/i.test(s)
  ) {
    if (/round\s*3|third\s*round/i.test(s)) return "interview_3";
    if (/round\s*2|second\s*round/i.test(s)) return "interview_2";
    return "interview_1";
  }

  // Assignment signals — require clear action/status context, not just the word "assessment"
  if (
    /(?:complete|submit)\s*(?:the|this|your|a)?\s*(?:assignment|assessment|task|test)/i.test(s) ||
    /take[\s-]*home\s*(?:assignment|task|test)/i.test(s) ||
    /(?:assignment|assessment)\s*(?:details|instructions|attached|link|due)/i.test(s) ||
    /received\s*your\s*assignment/i.test(s) ||
    /sending\s*you\s*(?:the|an?)\s*(?:assignment|assessment)/i.test(s)
  ) {
    return "assignment";
  }

  // Shortlisted / Phone screen — require clear context
  if (
    /you(?:'ve| have)\s*been\s*(?:shortlisted|selected)/i.test(s) ||
    /moving\s*(?:forward|ahead)\s*with\s*your\s*(?:application|candidacy)/i.test(s)
  ) {
    return "phone_screen";
  }

  // Acknowledged
  if (
    /received\s*your\s*application/i.test(s) ||
    /thank\s*you\s*for\s*(?:applying|your\s*application)/i.test(s) ||
    /application\s*(?:has\s*been\s*)?received/i.test(s)
  ) {
    return "acknowledged";
  }

  return null;
}

// ── Application Matching ───────────────────────────────────────

function companyMatches(stored: string, extracted: string): boolean {
  const a = normalizeForDedup(stored);
  const b = normalizeForDedup(extracted);
  if (!a || !b) return false;
  // Direct includes (bidirectional)
  if (a.includes(b) || b.includes(a)) return true;
  // Also try without spaces: "Urban Company" → "urbancompany" vs "urbancompany"
  const aNoSpace = a.replace(/\s/g, "");
  const bNoSpace = b.replace(/\s/g, "");
  if (aNoSpace.includes(bNoSpace) || bNoSpace.includes(aNoSpace)) return true;
  return false;
}

function roleMatches(stored: string, extracted: string): boolean {
  const a = normalizeForDedup(stored);
  const b = normalizeForDedup(extracted);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

type CachedApp = { id: string; company: string; role: string; status: string; emailThreadId: string | null; followUpDate: Date | null };

function matchToApplicationCached(apps: CachedApp[], parsed: ParsedEmail): CachedApp | null {
  if (!parsed.company) return null;
  // Priority 1: company + role
  if (parsed.role) {
    const m = apps.find((a) => companyMatches(a.company, parsed.company) && roleMatches(a.role, parsed.role!));
    if (m) return m;
  }
  // Priority 2: company only
  return apps.find((a) => companyMatches(a.company, parsed.company)) || null;
}

export async function matchToApplication(userId: string, parsed: ParsedEmail) {
  if (!parsed.company) return null;
  const apps = await prisma.application.findMany({
    where: { userId },
    select: { id: true, company: true, role: true, status: true, emailThreadId: true, followUpDate: true },
  });
  return matchToApplicationCached(apps, parsed);
}

// ── Concurrent email fetcher ───────────────────────────────────
// Fetches emails in parallel batches of 10 to avoid rate limits.
// skipIfNoStage: true = only return emails that have a detectable stage (for re-check)
async function fetchEmailsConcurrently(
  gmail: ReturnType<typeof google.gmail>,
  messageIds: string[],
  userEmail: string,
  results: SyncResults,
  skipIfNoStage = false
): Promise<ParsedEmail[]> {
  const CONCURRENCY = 10;
  const parsed: ParsedEmail[] = [];

  for (let i = 0; i < messageIds.length; i += CONCURRENCY) {
    const batch = messageIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((id) => parseEmail(gmail, id, userEmail))
    );
    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        if (!skipIfNoStage || result.value.stage) {
          parsed.push(result.value);
          results.emailsProcessed++;
        }
      } else {
        results.emailsSkipped = (results.emailsSkipped ?? 0) + 1;
      }
    }
  }
  return parsed;
}

// ── Build Gmail search terms from a company name ───────────────
function companySearchTerms(company: string): string[] {
  const norm = normalizeForDedup(company); // strips special chars, lowercases
  const noSpace = norm.replace(/\s+/g, ""); // "thesleepcompany" → "thesleepcompany"
  const words = norm.split(/\s+/).filter((w) => w.length >= 4); // meaningful words
  return [...new Set([noSpace, ...words].filter(Boolean))];
}

// Build a Gmail search query for a specific company (inbound + outbound)
function buildCompanyQuery(company: string, since: string): string {
  const terms = companySearchTerms(company);
  if (!terms.length) return "";
  // Gmail search: from:term OR from:term2 (not from:(a OR b) — that syntax is unsupported)
  const fromTerms = terms.map((t) => `from:${t}`).join(" OR ");
  const subjectTerms = terms.map((t) => `subject:${t}`).join(" OR ");
  const toTerms = terms.map((t) => `to:${t}`).join(" OR ");
  // Inbound: emails from the company or with company name in subject
  const inbound = `(${fromTerms} OR ${subjectTerms}) ${since} -category:promotions`;
  // Outbound: emails sent by the user to the company or mentioning them in subject
  const outbound = `(from:me (${toTerms} OR ${subjectTerms}) ${since})`;
  return `(${inbound}) OR ${outbound}`;
}

// ── Core scanner: runs per Gmail account ──────────────────────
// Uses 4 broad queries instead of N per-company queries.
// Broad queries are reliable regardless of how company names are stored.
async function scanAccountForApplications(
  gmail: ReturnType<typeof google.gmail>,
  accountEmail: string,
  _applications: CachedApp[],   // kept for signature compat; not used for query building
  existingMessageIds: Set<string>,
  since: string,
  results: SyncResults
): Promise<ParsedEmail[]> {
  const allIds = new Set<string>();

  // 4 queries that together cover every job-related email:
  const queries: string[] = [
    // 1. All inbound non-promotional emails — catches ACKs, interview invites, rejections
    `-from:me -category:promotions ${since}`,
    // 2. Outbound to professional addresses — catches cold outreach, follow-ups
    `from:me in:sent -to:gmail.com -to:yahoo.com -to:hotmail.com -to:outlook.com -to:rediffmail.com -to:icloud.com -to:live.com -to:ymail.com ${since}`,
    // 3. LinkedIn/Naukri/portal application emails (often land in promotions, missed by query 1)
    `(from:linkedin.com OR from:naukri.com OR from:instahyre.com OR from:foundit.com) ${since}`,
    // 4. ATS system emails (Greenhouse, Lever, Keka, Darwinbox, Zoho, etc.)
    `(from:greenhouse.io OR from:lever.co OR from:workday.com OR from:ashbyhq.com OR from:kekamail.com OR from:darwinbox.com OR from:zohorecruit.com OR from:smartrecruiters.com) ${since}`,
  ];

  const searchResults = await Promise.allSettled(
    queries.map((q) => searchEmails(gmail, q, 100))
  );
  for (let i = 0; i < searchResults.length; i++) {
    const r = searchResults[i];
    if (r.status === "fulfilled") {
      r.value.forEach((id) => allIds.add(id));
    } else {
      console.error(`[Scan] Query ${i} failed:`, (searchResults[i] as PromiseRejectedResult).reason);
      results.gmailSearchErrors = (results.gmailSearchErrors ?? 0) + 1;
    }
  }
  results.gmailIdsFound = (results.gmailIdsFound ?? 0) + allIds.size;

  // Fetch all found emails concurrently (new ones fully, existing ones only if they have a stage)
  const newIds = [...allIds].filter((id) => !existingMessageIds.has(id));
  const existingIds = [...allIds].filter((id) => existingMessageIds.has(id));

  const [newParsed, recheckParsed] = await Promise.all([
    fetchEmailsConcurrently(gmail, newIds, accountEmail, results),
    fetchEmailsConcurrently(gmail, existingIds, accountEmail, results, true),
  ]);

  return [...newParsed, ...recheckParsed];
}

// ── Backfill & Sync ────────────────────────────────────────────

export async function processBackfill(userId: string) {
  const [gmail, user, applications, linkedAccounts] = await Promise.all([
    getGmailClient(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.application.findMany({
      where: { userId },
      select: { id: true, company: true, role: true, status: true, emailThreadId: true, followUpDate: true },
    }),
    prisma.linkedGmailAccount.findMany({ where: { userId } }),
  ]);

  const userEmail = user?.email || "";
  const results = {
    applicationsCreated: 0,
    applicationsUpdated: 0,
    touchpointsAdded: 0,
    emailsProcessed: 0,
    emailsSkipped: 0,
    gmailIdsFound: 0,
    gmailSearchErrors: 0,
    linkedAccountsFound: linkedAccounts.length,
  };

  // Pre-load existing touchpoint messageIds
  const existingMessageIds = new Set(
    (await prisma.touchpoint.findMany({
      where: { application: { userId } },
      select: { emailMessageId: true },
    })).map((t) => t.emailMessageId).filter(Boolean) as string[]
  );

  const since = "newer_than:3m";

  // Scan primary account and all linked accounts in parallel
  const [primaryParsed, ...linkedParsedArrays] = await Promise.all([
    scanAccountForApplications(gmail, userEmail, applications, existingMessageIds, since, results),
    ...linkedAccounts.map(async (linked) => {
      try {
        const { gmail: linkedGmail, email: linkedEmail } = await getGmailClientForLinked(linked.id);
        return scanAccountForApplications(linkedGmail, linkedEmail, applications, existingMessageIds, since, results);
      } catch (err) {
        console.error(`[Backfill] Linked account ${linked.email} failed:`, err);
        return [] as ParsedEmail[];
      }
    }),
  ]);

  // Process primary account emails
  primaryParsed.sort((a, b) => a.date.getTime() - b.date.getTime());
  await processEmailList(userId, primaryParsed, results, userEmail, applications);

  // Process each linked account's emails
  for (let i = 0; i < linkedAccounts.length; i++) {
    const linked = linkedAccounts[i];
    const parsed = linkedParsedArrays[i] ?? [];
    parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
    const { email: linkedEmail } = await getGmailClientForLinked(linked.id);
    await processEmailList(userId, parsed, results, linkedEmail, applications);
    await prisma.linkedGmailAccount.update({
      where: { id: linked.id },
      data: { lastSyncedAt: new Date(), backfillDone: true },
    });
  }

  await prisma.gmailSyncState.upsert({
    where: { userId },
    update: { lastSyncedAt: new Date(), backfillDone: true },
    create: { userId, lastSyncedAt: new Date(), backfillDone: true },
  });

  return results;
}

export async function processSync(userId: string) {
  const [gmail, user, applications, linkedAccounts, syncState] = await Promise.all([
    getGmailClient(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.application.findMany({
      where: { userId },
      select: { id: true, company: true, role: true, status: true, emailThreadId: true, followUpDate: true },
    }),
    prisma.linkedGmailAccount.findMany({ where: { userId } }),
    prisma.gmailSyncState.findUnique({ where: { userId } }),
  ]);

  const userEmail = user?.email || "";
  const results = {
    applicationsCreated: 0,
    applicationsUpdated: 0,
    touchpointsAdded: 0,
    emailsProcessed: 0,
    emailsSkipped: 0,
  };

  const existingMessageIds = new Set(
    (await prisma.touchpoint.findMany({
      where: { application: { userId } },
      select: { emailMessageId: true },
    })).map((t) => t.emailMessageId).filter(Boolean) as string[]
  );

  // Use last sync time with 1-hour buffer, or fall back to 1 week
  const since = syncState?.lastSyncedAt
    ? `after:${Math.floor(syncState.lastSyncedAt.getTime() / 1000) - 3600}`
    : "newer_than:1w";

  // Scan primary + linked accounts in parallel
  const [primaryParsed, ...linkedParsedArrays] = await Promise.all([
    scanAccountForApplications(gmail, userEmail, applications, existingMessageIds, since, results),
    ...linkedAccounts.map(async (linked) => {
      try {
        const { gmail: linkedGmail, email: linkedEmail } = await getGmailClientForLinked(linked.id);
        const linkedSince = linked.lastSyncedAt
          ? `after:${Math.floor(linked.lastSyncedAt.getTime() / 1000) - 3600}`
          : "newer_than:1w";
        return scanAccountForApplications(linkedGmail, linkedEmail, applications, existingMessageIds, linkedSince, results);
      } catch (err) {
        console.error(`[Sync] Linked account ${linked.email} failed:`, err);
        return [] as ParsedEmail[];
      }
    }),
  ]);

  primaryParsed.sort((a, b) => a.date.getTime() - b.date.getTime());
  await processEmailList(userId, primaryParsed, results, userEmail, applications);

  for (let i = 0; i < linkedAccounts.length; i++) {
    const linked = linkedAccounts[i];
    const parsed = linkedParsedArrays[i] ?? [];
    parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
    const { email: linkedEmail } = await getGmailClientForLinked(linked.id);
    await processEmailList(userId, parsed, results, linkedEmail, applications);
    await prisma.linkedGmailAccount.update({
      where: { id: linked.id },
      data: { lastSyncedAt: new Date() },
    });
  }

  await prisma.gmailSyncState.upsert({
    where: { userId },
    update: { lastSyncedAt: new Date() },
    create: { userId, lastSyncedAt: new Date() },
  });

  return results;
}
