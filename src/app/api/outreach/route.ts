/**
 * API Route: POST /api/outreach
 *
 * Unified orchestration endpoint for the outreach automation.
 * Actions: find-contacts | find-emails | generate-email | send-email
 */

import { NextRequest, NextResponse } from "next/server";

import { searchCandidatesAuto } from "@/lib/pipeline/search";
import { rankCandidates } from "@/lib/pipeline/rank";
import { enrichAll, type PersonInput } from "@/lib/automation/email-finder";
import { executeResearch } from "@/lib/email-generator/research";
import { generateCopy } from "@/lib/email-generator/templates";
import { sendOutboundEmail } from "@/lib/pipeline/send";
import { prisma, getDefaultUserId } from "@/lib/prisma";

export const maxDuration = 60; // Allow up to 60s on Vercel Pro

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "find-contacts":
        return handleFindContacts(body);
      case "find-emails":
        return handleFindEmails(body, req);
      case "generate-email":
        return handleGenerateEmail(body);
      case "send-email":
        return handleSendEmail(body);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Outreach API error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── Phase 1: Find Decision Makers ──────────────────────────────

async function handleFindContacts(body: {
  company: string;
  jobTitle: string;
  jd?: string;
  excludeNames?: string[];
}) {
  const { company, jobTitle, jd, excludeNames = [] } = body;

  if (!company?.trim() || !jobTitle?.trim()) {
    return NextResponse.json(
      { error: "Company and job title are required." },
      { status: 400 }
    );
  }

  // Step 1: Search for candidates (Google CSE or LLM fallback)
  // This also extracts any contacts mentioned in the JD
  const { results: searchResults, jdContacts, localApiUsage, deptKeywords } = await searchCandidatesAuto(
    company,
    jobTitle,
    jd,
    excludeNames
  );

  if (!searchResults.length && !jdContacts.length) {
    return NextResponse.json(
      { error: "No candidates found. Try a different company or role." },
      { status: 404 }
    );
  }

  // Step 2: Rank LLM-discovered contacts
  const ranked = searchResults.length
    ? await rankCandidates(searchResults, company, jobTitle, jd, excludeNames, deptKeywords)
    : [];


  // Step 3: Prepend JD-extracted contacts at top (they're confirmed)
  const jdRanked = await Promise.all(jdContacts.map(async (c) => {
    let profile_url = "";
    try {
      const q = `site:linkedin.com/in intitle:"${company}" "${c.name}"`;
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY || "", "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 3 })
      });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.organic || [])) {
          if (item.link && item.link.includes("linkedin.com/in/")) {
            profile_url = item.link.split("?")[0].replace(/\/$/, "");
            break;
          }
        }
      }
    } catch(e) {}
    
    return {
      name: c.name,
      profile_url,
      current_title: c.context,
      role_type: "recruiter_hr" as const,
      confidence: 1.0,
      reason: "Explicitly mentioned in the job description as a contact person",
      email: c.email || undefined,
    };
  }));

  const allCandidates = [...jdRanked, ...ranked];

  return NextResponse.json({
    searchResults,
    jdContacts,
    rankedCandidates: allCandidates,
    localApiUsage,
  });
}

// ─── Phase 2: Find Emails ───────────────────────────────────────

async function handleFindEmails(
  body: {
    contacts: Array<{
      name: string;
      company: string;
      domain?: string;
      email?: string;
    }>;
    hunterKey?: string;
    apolloKey?: string;
  },
  req: NextRequest
) {
  const { contacts } = body;

  if (!contacts?.length) {
    return NextResponse.json(
      { error: "No contacts provided." },
      { status: 400 }
    );
  }

  // Fallback chain: request header → body field → server-side env vars
  // This ensures automated tests (Playwright) work without localStorage being populated.
  const hunterKey = (
    req.headers.get("x-hunter-key") ||
    body.hunterKey ||
    process.env.HUNTER_API_KEY ||
    process.env.NEXT_PUBLIC_HUNTER_API_KEY ||
    ""
  ).trim();
  const apolloKey = (
    req.headers.get("x-apollo-key") ||
    body.apolloKey ||
    process.env.APOLLO_API_KEY ||
    process.env.NEXT_PUBLIC_APOLLO_API_KEY ||
    ""
  ).trim();

  console.log(`[find-emails] hunterKey present: ${!!hunterKey}, apolloKey present: ${!!apolloKey}`);
  if (!hunterKey) console.warn("[find-emails] WARNING: Hunter API key missing — Hunter.io will be skipped!");
  if (!apolloKey) console.warn("[find-emails] WARNING: Apollo API key missing — Apollo.io will be skipped!");

  const people: PersonInput[] = contacts.map((c) => ({
    name: c.name,
    company: c.company,
    domain: c.domain ?? "",
    email: c.email,
  }));

  const { results, localApiUsage } = await enrichAll(people, hunterKey, apolloKey);

  return NextResponse.json({ emailResults: results, localApiUsage });
}

// ─── Phase 3: Generate Email ────────────────────────────────────

async function handleGenerateEmail(body: {
  recipientName: string;
  company: string;
  jobTitle: string;
  jd?: string;
  profileUrl?: string;
}) {
  const { recipientName, company, jobTitle, jd, profileUrl } = body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const userId = await getDefaultUserId();
  const profile = await prisma.profileContext.findUnique({ where: { userId } });

  // Step 1: Run the ACTUAL Email Generator Research Pipeline (RAG + Jina + Search)
  const research = await executeResearch({
    companyName: company,
    industry: "Technology", // Default or extract if possible
    role: jobTitle,
    contactName: recipientName,
    jobDescription: jd,
  }, apiKey, profile);

  if (!research.problems || research.problems.length === 0) {
    throw new Error("Research pipeline failed to generate hypotheses.");
  }

  const drafts = await Promise.all(research.problems.slice(0, 3).map(async (problem) => {
    // Step 2: Use the exact templates the user built
    const rawText = await generateCopy(
      problem,
      "Cold Email", // default format
      recipientName,
      company,
      jobTitle,
      profile || undefined
    );

    // Step 3: Parse the raw text template into beautifully formatted HTML
    let htmlBody = `<body style="font-family: Arial, Helvetica, sans-serif; color: #000; line-height: 1.5; font-size: 14px;">\n`;
    
    const sections = rawText.split("For your reference:");
    const mainBody = sections[0].trim();
    
    const paragraphs = mainBody.split("\n\n");
    for (const para of paragraphs) {
      if (para.includes("• ")) {
        htmlBody += `  <ul style="margin: 0; padding-left: 20px;">\n`;
        const lines = para.split("\n").filter(l => l.trim());
        for (const line of lines) {
          htmlBody += `    <li style="margin-bottom: 8px; margin-left: 15px;">${line.replace("• ", "")}</li>\n`;
        }
        htmlBody += `  </ul>\n`;
      } else {
        const formattedPara = para.split("\n").join("<br>");
        htmlBody += `  <p>${formattedPara}</p>\n`;
      }
    }

    // Inject the clean inline reference links
    const portfolio = profile?.portfolioUrl || "[Your Portfolio URL]";
    const phone = profile?.phone || "[Your Phone Number]";
    const linkedin = profile?.linkedinUrl || "[Your LinkedIn URL]";
    const cv = profile?.resume || "[Your CV URL]";
    
    htmlBody += `  <p>For your reference, you can view my <a href="${portfolio}" style="color:#0366d6; text-decoration:underline;">Portfolio</a> (reachable at ${phone}), connect with me on <a href="${linkedin}" style="color:#0366d6; text-decoration:underline;">LinkedIn</a>, or review my <a href="${cv}" style="color:#0366d6; text-decoration:underline;">CV</a>.</p>\n`;
    if (profileUrl) {
      htmlBody += `  <div data-linkedin-url="${profileUrl}" style="display:none;">${profileUrl}</div>\n`;
    }
    htmlBody += `</body>`;

    // Generate subject
    const subject = `Application: ${jobTitle} — ${company}`;

    return {
      subject,
      htmlBody,
      rawText: mainBody, // Pass the clean raw text for UI editing
      reason: problem.hypothesis, // Pass back hypothesis as context
      problemTitle: problem.title || "Option",
    };
  }));

  return NextResponse.json({
    drafts,
  });
}

// ─── Phase 4: Send Email ────────────────────────────────────────

async function handleSendEmail(body: {
  toEmail: string;
  toName: string;
  subject: string;
  htmlBody: string;
  company: string;
  jobTitle: string;
  saveToTracker?: boolean;
}) {
  const { toEmail, toName, subject, htmlBody, company, jobTitle } = body;

  console.log(`[API] Received send-email request for ${toEmail}`);

  if (!toEmail?.trim()) {
    console.error(`[API] Missing toEmail!`);
    return NextResponse.json(
      { error: "Recipient email is required." },
      { status: 400 }
    );
  }

  // Send the email
  try {
    const result = await sendOutboundEmail({
      to_email: toEmail,
      to_name: toName || "",
      subject,
      html_body: htmlBody,
      company,
      job_title: jobTitle,
    });
    console.log(`[API] sendOutboundEmail successful! MessageId: ${result.messageId}`);


    // Save to OutreachCampaign
    try {
      const userId = await getDefaultUserId();
      await prisma.outreachCampaign.create({
        data: {
          userId,
          company,
          role: jobTitle,
          hiringManager: toName || null,
          emails: [toEmail],
          subject,
          body: htmlBody,
          status: "sent",
          sentAt: new Date(),
        },
      });
    } catch (dbErr) {
      console.error("[API] Failed to save outreach campaign to DB:", dbErr);
      // don't throw, we still sent the email (or created the draft)
    }

    console.log(`[API] Finished processing send-email for ${toEmail}`);
    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (sendErr) {
    console.error(`[API] Failed to send email via IMAP:`, sendErr);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
