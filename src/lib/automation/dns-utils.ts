import dns from "dns/promises";

/* ── Disposable domain detection ── */

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com",
  "trashmail.com","spamgourmet.com","maildrop.cc","getnada.com","tempmail.plus",
  "dispostable.com","fakeinbox.com","guerrillamail.net","yopmail.com","mailnesia.com",
  "guerrillamail.org","disposablemail.com","mailcatch.com","spambog.org",
  "throwaway.email","temp-mail.org","sharklasers.com","guerrillamailblock.com",
  "grr.la","pokemail.net","spam4.me","tempr.email","throwawaymail.com",
  "mytemp.email","mohmal.com","emailondeck.com","mintemail.com","tempmailaddress.com",
  "tempinbox.com","jetable.org","getairmail.com","anonbox.net","anonymbox.com",
  "burnermail.io","33mail.com","emailfake.com","meltmail.com",
  "moakt.com","rootprompt.org","trashmailer.com","wegwerfmail.de","fakemail.net",
  "harakirimail.com","kasmail.com","safersignup.com","spambox.us",
]);

const DISPOSABLE_PATTERNS = [
  "temp","disposable","trash","fake","throw","guerrilla",
  "burner","spam","discard","junk","temporary",
];

export function isDisposable(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    DISPOSABLE_DOMAINS.has(d) ||
    DISPOSABLE_PATTERNS.some((p) => d.includes(p))
  );
}

/* ── Free / corporate classification ── */

const FREE_PROVIDERS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","live.com",
  "aol.com","icloud.com","me.com","mac.com","protonmail.com",
  "mail.com","zoho.com","yandex.com","gmx.com","gmx.net",
  "mail.ru","inbox.com","fastmail.com","hushmail.com","tutanota.com",
  "mailbox.org","runbox.com","posteo.de","disroot.org",
]);

export function isFreeProvider(domain: string): boolean {
  return FREE_PROVIDERS.has(domain.toLowerCase());
}

/* ── Role-based local part detection ── */

const ROLE_PATTERNS = [
  /^(admin|administrator)/i,
  /^(info|information)/i,
  /^(support|help|helpdesk)/i,
  /^(contact|contactus)/i,
  /^(sales|sale)/i,
  /^(hr|humanresources|recruitment|recruiter|recruiting|talent)/i,
  /^(team|staff)/i,
  /^(careers|jobs|career)/i,
  /^(noreply|no-reply|do-not-reply|donotreply)/i,
  /^(postmaster|webmaster|hostmaster|sysadmin)/i,
  /^(abuse|security|privacy|legal|compliance)/i,
  /^(billing|invoice|invoices|accounts|accounting|finance)/i,
  /^(marketing|newsletter|news|subscribe|subscription)/i,
  /^(office|hello|general|enquiries|inquiries)/i,
  /^(feedback|suggestion|suggestions)/i,
  /^(press|media|pr)/i,
];

export function isRoleBased(local: string): boolean {
  return ROLE_PATTERNS.some((p) => p.test(local));
}

/* ── Common typo map ── */

const TYPO_MAP: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "outloo.com": "outlook.com",
  "outlok.com": "outlook.com",
  "outloook.com": "outlook.com",
  "iclod.com": "icloud.com",
  "iclould.com": "icloud.com",
};

export function checkTypo(domain: string): string | null {
  return TYPO_MAP[domain.toLowerCase()] ?? null;
}

/* ── Provider inference from MX hosts ── */

const PROVIDER_PATTERNS: { name: string; patterns: string[] }[] = [
  { name: "google", patterns: ["google.com","gmail-smtp-in.l.google.com","aspmx.l.google.com","googlemail.com"] },
  { name: "microsoft", patterns: ["outlook.com","protection.outlook.com","mail.protection.outlook.com","office365"] },
  { name: "amazon", patterns: ["amazonses.com","amazonaws.com"] },
  { name: "sendgrid", patterns: ["sendgrid.net"] },
  { name: "mailgun", patterns: ["mailgun.org","mailgun.net"] },
  { name: "zoho", patterns: ["zoho.com","zohomail.com"] },
  { name: "protonmail", patterns: ["protonmail.ch","protonmail.com"] },
];

export function inferProvider(mxHosts: string[]): string | null {
  if (!mxHosts.length) return null;
  const joined = mxHosts.join(" ").toLowerCase();
  for (const p of PROVIDER_PATTERNS) {
    if (p.patterns.some((pat) => joined.includes(pat))) return p.name;
  }
  return "other";
}

/* ── Safe DNS helpers ── */

export async function resolveMxSafe(domain: string) {
  try {
    const records = await dns.resolveMx(domain);
    records.sort((a, b) => a.priority - b.priority);
    return records;
  } catch {
    return null;
  }
}

export async function resolve4Safe(name: string): Promise<string[]> {
  try {
    return await dns.resolve4(name);
  } catch {
    return [];
  }
}

export async function resolveTxtSafe(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((arr) => arr.join(""));
  } catch {
    return [];
  }
}

/* ── DKIM selectors to probe ── */

export const DKIM_SELECTORS = [
  "default","google","selector1","selector2","s1","s2","mail",
  "smtpapi","k1","k2","selector","mailgun","amazonses","sg","mandrill","dkim",
];

/* ── SPF parsing ── */

export function parseSpf(spfText: string) {
  const s = spfText.toLowerCase();
  const found = /v=spf1/.test(s);
  const qualMatch = s.match(/\s([+\-~?]all)/);
  let qualifier: string | null = null;
  let strict = false;
  if (qualMatch?.[1]) {
    qualifier = qualMatch[1][0];
    strict = qualifier === "-";
  }
  return { found, strict, qualifier };
}
