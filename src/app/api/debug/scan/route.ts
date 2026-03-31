import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getGmailClient, getGmailClientForLinked, searchEmails, parseEmail } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gmail = await getGmailClient(user.id);
  const userInfo = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  const userEmail = userInfo?.email || "";

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    select: { id: true, company: true, role: true, status: true, platform: true },
    orderBy: { dateApplied: "desc" },
  });

  const existingTouchpoints = await prisma.touchpoint.findMany({
    where: { application: { userId: user.id } },
    select: { emailMessageId: true, applicationId: true },
  });
  const existingMessageIds = new Set(
    existingTouchpoints.map((t) => t.emailMessageId).filter(Boolean) as string[]
  );

  const linkedAccounts = await prisma.linkedGmailAccount.findMany({
    where: { userId: user.id },
    select: { id: true, email: true },
  });

  const since = "newer_than:3m";

  // ── Build the same queries as scanAccountForApplications ──
  const inboundKeywords = [
    "application", "applied", "applying", "submitted", "received",
    "acknowledged", "shortlisted", "selected", "rejected", "regret",
    "unfortunately", "interview", "assessment", "candidature",
    "congratulations", "offer", "resume", "hiring",
  ].map((k) => `subject:${k}`).join(" OR ");

  const outboundKeywords = [
    "application", "applying", "resume", "interest",
    "opportunity", "hiring", "position", "role",
    "APM", '"product manager"', '"associate product manager"',
    "internship",
  ].map((k) => `subject:${k}`).join(" OR ");

  const atsDomains = [
    "greenhouse.io", "lever.co", "kekamail.com", "darwinbox.com",
    "zohorecruit.com", "smartrecruiters.com", "ashbyhq.com",
    "workday.com", "icims.com", "breezy.hr", "freshteam.com",
    "bamboohr.com", "myworkdayjobs.com",
  ].map((d) => `from:${d}`).join(" OR ");

  const portalAppQuery = [
    "from:linkedin.com", "from:naukri.com", "from:instahyre.com", "from:foundit.com",
  ].join(" OR ");

  const queries = [
    { label: "inbound-keywords", q: `(${inboundKeywords}) -from:me ${since}` },
    { label: "outbound", q: `from:me (${outboundKeywords}) ${since}` },
    { label: "ats-domains", q: `(${atsDomains}) ${since}` },
    { label: "portal-apps", q: `(${portalAppQuery}) (subject:application OR subject:applied OR subject:submitted OR subject:update) ${since}` },
  ];

  // ── Run queries on primary account ──
  const queryResults: Array<{ label: string; query: string; count: number; error?: string; ids: string[] }> = [];

  for (const { label, q } of queries) {
    try {
      const ids = await searchEmails(gmail, q, 100);
      queryResults.push({ label, query: q, count: ids.length, ids });
    } catch (err) {
      queryResults.push({ label, query: q, count: 0, error: String(err), ids: [] });
    }
  }

  // Deduplicate all IDs
  const allIds = new Set<string>();
  for (const qr of queryResults) qr.ids.forEach((id) => allIds.add(id));

  // ── Parse a sample of emails to see what happens ──
  const sampleIds = [...allIds].slice(0, 30); // limit to 30 to avoid timeout
  const parseResults: Array<{
    messageId: string;
    isNew: boolean;
    result: "kept" | "filtered";
    reason?: string;
    company?: string;
    role?: string;
    stage?: string;
    subject?: string;
    from?: string;
    isOutbound?: boolean;
  }> = [];

  for (const id of sampleIds) {
    const isNew = !existingMessageIds.has(id);
    try {
      const parsed = await parseEmail(gmail, id, userEmail);
      if (parsed) {
        parseResults.push({
          messageId: id,
          isNew,
          result: "kept",
          company: parsed.company,
          role: parsed.role || undefined,
          stage: parsed.stage || undefined,
          subject: parsed.subject?.slice(0, 80),
          from: parsed.from?.slice(0, 50),
          isOutbound: parsed.isOutbound,
        });
      } else {
        // parseEmail returned null — re-fetch just the subject/from to show what was filtered
        try {
          const res = await gmail.users.messages.get({
            userId: "me", id, format: "metadata",
            metadataHeaders: ["From", "Subject"],
          });
          const headers = res.data.payload?.headers || [];
          const subj = headers.find((h) => h.name === "Subject")?.value || "";
          const frm = headers.find((h) => h.name === "From")?.value || "";
          parseResults.push({
            messageId: id,
            isNew,
            result: "filtered",
            reason: "parseEmail returned null",
            subject: subj?.slice(0, 80),
            from: frm?.slice(0, 50),
          });
        } catch {
          parseResults.push({ messageId: id, isNew, result: "filtered", reason: "parseEmail returned null (couldn't re-fetch)" });
        }
      }
    } catch (err) {
      parseResults.push({ messageId: id, isNew, result: "filtered", reason: `Error: ${String(err).slice(0, 100)}` });
    }
  }

  // ── Also run queries on linked accounts ──
  const linkedResults: Array<{ email: string; queryResults: typeof queryResults; error?: string }> = [];
  for (const linked of linkedAccounts) {
    try {
      const { gmail: linkedGmail, email: linkedEmail } = await getGmailClientForLinked(linked.id);
      const lqr: typeof queryResults = [];
      for (const { label, q } of queries) {
        try {
          const ids = await searchEmails(linkedGmail, q, 100);
          lqr.push({ label, query: q, count: ids.length, ids });
        } catch (err) {
          lqr.push({ label, query: q, count: 0, error: String(err), ids: [] });
        }
      }
      linkedResults.push({ email: linkedEmail, queryResults: lqr });
    } catch (err) {
      linkedResults.push({ email: linked.email, queryResults: [], error: String(err) });
    }
  }

  return NextResponse.json({
    userEmail,
    applicationCount: applications.length,
    applications: applications.map((a) => ({
      company: a.company,
      role: a.role,
      status: a.status,
      platform: a.platform,
    })),
    existingTouchpointCount: existingMessageIds.size,
    linkedAccounts: linkedAccounts.map((l) => l.email),
    primaryAccount: {
      queryResults: queryResults.map(({ label, query, count, error }) => ({ label, query: query.slice(0, 120), count, error })),
      totalUniqueIds: allIds.size,
      newIds: [...allIds].filter((id) => !existingMessageIds.has(id)).length,
      existingIds: [...allIds].filter((id) => existingMessageIds.has(id)).length,
    },
    linkedAccountResults: linkedResults.map((lr) => ({
      email: lr.email,
      error: lr.error,
      queryResults: lr.queryResults.map(({ label, count, error }) => ({ label, count, error })),
      totalUniqueIds: new Set(lr.queryResults.flatMap((qr) => qr.ids)).size,
    })),
    emailSamples: parseResults,
  });
}
