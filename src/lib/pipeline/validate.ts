/**
 * Phase 3b: DNS-only email validation
 *
 * Replaces: the entire Email Validator API flow (Flow 2)
 * Called directly as a function — no internal webhook needed.
 *
 * Key optimization: stops on first valid email (no wasted DNS lookups)
 */

import type { ValidationResult, EmailCandidate } from "../types";
import {
  resolveMxSafe,
  resolve4Safe,
  resolveTxtSafe,
  isDisposable,
  isFreeProvider,
  isRoleBased,
  checkTypo,
  inferProvider,
  parseSpf,
  DKIM_SELECTORS,
} from "../automation/dns-utils";

/* ── Syntax check ── */

function validSyntax(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return (
    /^[a-zA-Z0-9._%+\-']+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email) &&
    email.length <= 254
  );
}

function checkLocalPart(local: string): { ok: boolean; reason: string } {
  if (!local) return { ok: false, reason: "empty_local" };
  if (local.length > 64) return { ok: false, reason: "local_too_long" };
  if (local.includes("..")) return { ok: false, reason: "consecutive_dots" };
  if (!/^[a-zA-Z0-9._%+\-']+$/.test(local))
    return { ok: false, reason: "invalid_chars" };
  return { ok: true, reason: isRoleBased(local) ? "role_like" : "ok" };
}

/* ── Confidence scoring (recruiting-tuned) ── */

function computeScores(sig: Partial<ValidationResult>): {
  confidence: number;
  recruiting_score: number;
} {
  let score = 0;
  if (sig.syntax_ok) score += 0.16;
  if (sig.local_part_ok) score += 0.08;
  if (sig.mx_ok) score += 0.26;
  if (sig.domain_ok) score += 0.10;
  if (sig.disposable) score -= 0.30;
  if (sig.role_based) score -= 0.12;
  if (sig.spf_strict) score += 0.06;
  if (sig.has_dmarc) score += 0.05;
  if (sig.is_free_provider) score -= 0.05;
  if (sig.typo_suggestion) score -= 0.15;
  if (sig.transactional_host) score -= 0.05;

  let confidence = Math.max(0, Math.min(1, score));
  if (confidence === 0 && sig.syntax_ok && (sig.domain_ok || sig.mx_ok)) {
    confidence = 0.2;
  }

  // Recruiting score: further penalize non-person emails
  let recruiting = confidence;
  if (sig.role_based) recruiting *= 0.5;
  if (sig.is_free_provider) recruiting *= 0.75;
  if (sig.disposable) recruiting *= 0.1;
  if (sig.typo_suggestion) recruiting *= 0.4;
  if (sig.is_corporate && sig.has_dmarc && sig.spf_strict) recruiting *= 1.2;
  if (sig.mx_ok && (sig.provider === "google" || sig.provider === "microsoft"))
    recruiting *= 1.15;
  if (sig.transactional_host) recruiting *= 0.7;

  return {
    confidence: Number(confidence.toFixed(2)),
    recruiting_score: Math.min(1, Number(recruiting.toFixed(2))),
  };
}

/* ── Validate a single email ── */

export async function validateEmail(email: string): Promise<ValidationResult> {
  const out: ValidationResult = {
    email,
    syntax_ok: false,
    local_part_ok: false,
    local_reason: null,
    domain: null,
    domain_ok: false,
    mx_ok: false,
    mx_hosts: [],
    provider: null,
    has_spf: false,
    spf_strict: false,
    has_dmarc: false,
    dmarc_policy: null,
    has_any_dkim: false,
    dkim_selectors_found: [],
    disposable: false,
    role_based: false,
    is_free_provider: false,
    is_corporate: false,
    transactional_host: false,
    typo_suggestion: null,
    confidence: 0,
    recruiting_score: 0,
    reason: "",
  };

  // 1. Syntax
  out.syntax_ok = validSyntax(email);
  if (!out.syntax_ok) {
    out.reason = "syntax_invalid";
    return out;
  }

  const [local, domainRaw] = email.split("@");
  const domain = (domainRaw ?? "").toLowerCase();
  out.domain = domain;

  // 2. Typo check
  const typo = checkTypo(domain);
  if (typo) {
    out.typo_suggestion = `${local}@${typo}`;
    out.reason = "possible_typo";
  }

  // 3. Local part
  const lc = checkLocalPart(local);
  out.local_part_ok = lc.ok;
  out.local_reason = lc.reason;
  out.role_based = isRoleBased(local);

  // 4. Disposable + free check
  out.disposable = isDisposable(domain);
  out.is_free_provider = isFreeProvider(domain);

  // 5. MX resolution
  const mx = await resolveMxSafe(domain);
  if (mx?.length) {
    out.mx_ok = true;
    out.domain_ok = true;
    out.mx_hosts = mx.map((m) => m.exchange);
    out.provider = inferProvider(out.mx_hosts);

    // Check for transactional hosts
    const txHosts = ["amazonses","sendgrid","mailgun","elasticemail","mailchimp","sparkpost","postmark","sendinblue"];
    const joined = out.mx_hosts.join(" ").toLowerCase();
    out.transactional_host = txHosts.some((t) => joined.includes(t));
  } else {
    const a = await resolve4Safe(domain);
    out.domain_ok = a.length > 0;
    if (!out.domain_ok) out.reason = "domain_not_found";
  }

  out.is_corporate = out.domain_ok && !out.is_free_provider && !out.disposable;

  // 6. Advanced DNS (SPF, DMARC, DKIM) - ONLY if MX is OK
  if (out.mx_ok) {
    const prioritySelectors = ["google","selector1","selector2","default","s1","s2"];
    
    // Run ALL text record lookups entirely in parallel
    const [txts, dmarcRecords, ...dkimResults] = await Promise.all([
      resolveTxtSafe(domain),
      resolveTxtSafe(`_dmarc.${domain}`),
      ...prioritySelectors.map((sel) => resolveTxtSafe(`${sel}._domainkey.${domain}`))
    ]);

    // Parse SPF
    for (const t of txts) {
      if (/v=spf1/i.test(t)) {
        out.has_spf = true;
        const spf = parseSpf(t);
        out.spf_strict = spf.strict;
        break;
      }
    }

    // Parse DMARC
    if (dmarcRecords.length) {
      out.has_dmarc = true;
      for (const rec of dmarcRecords) {
        const pm = rec.match(/p=([^;]+)/i);
        if (pm?.[1]) {
          out.dmarc_policy = pm[1].toLowerCase();
          break;
        }
      }
    }

    // Parse DKIM
    out.dkim_selectors_found = prioritySelectors.filter((_, idx) => dkimResults[idx].length > 0);
    out.has_any_dkim = out.dkim_selectors_found.length > 0;
  }

  // 9. Final reason
  if (!out.reason) {
    if (!out.domain_ok) out.reason = "domain_not_found";
    else if (!out.mx_ok) out.reason = "no_mx";
    else if (out.disposable) out.reason = "disposable_domain";
    else if (out.role_based) out.reason = "role_based_email";
    else out.reason = "passes_dns_checks";
  }

  // 10. Scores
  const scores = computeScores(out);
  out.confidence = scores.confidence;
  out.recruiting_score = scores.recruiting_score;

  return out;
}

/* ── Validate a list and return the first good email ── */

const RECRUITING_THRESHOLD = 0.55;

export async function findFirstValidEmail(
  candidates: EmailCandidate[]
): Promise<{ candidate: EmailCandidate; validation: ValidationResult } | null> {
  for (const candidate of candidates) {
    const result = await validateEmail(candidate.email);

    if (
      result.mx_ok &&
      result.domain_ok &&
      !result.disposable &&
      result.recruiting_score >= RECRUITING_THRESHOLD
    ) {
      return { candidate, validation: result };
    }
  }
  return null;
}
