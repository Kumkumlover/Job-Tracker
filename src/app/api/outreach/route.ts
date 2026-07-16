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
import { generateSimpleEmail } from "@/lib/email-generator/templates";
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

  // Enforce required backend API keys
  if (!process.env.SERPER_API_KEY) {
    return NextResponse.json(
      { error: "Missing SERPER_API_KEY. You must add this to your Vercel Environment Variables to search LinkedIn." },
      { status: 400 }
    );
  }
  
  if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Missing LLM API Key. You must add either OPENAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY to your Vercel Environment Variables to analyze job descriptions." },
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

  const allCandidatesUnfiltered = [...jdRanked, ...ranked];
  
  // Deduplicate candidates by name or profile_url
  const allCandidates: typeof allCandidatesUnfiltered = [];
  const seenNames = new Set<string>();
  const seenUrls = new Set<string>();

  for (const c of allCandidatesUnfiltered) {
    const normName = c.name.toLowerCase().trim();
    const normUrl = (c.profile_url || "").toLowerCase().trim();
    
    if (seenNames.has(normName)) continue;
    if (normUrl && seenUrls.has(normUrl)) continue;
    
    seenNames.add(normName);
    if (normUrl) seenUrls.add(normUrl);
    
    allCandidates.push(c);
  }

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
//
// Outreach automation flow — simple, fast, hallucination-free.
// Only 2 fields are LLM-generated (from the JD alone, no web scraping):
//   • companyMission  — noun phrase describing what the company is building
//   • matchedStrengths — noun phrase describing relevant skills
// All body bullets are hardcoded verbatim in generateSimpleEmail().

async function handleGenerateEmail(body: {
  recipientName: string;
  company: string;
  jobTitle: string;
  jd?: string;
}) {
  const { recipientName, company, jobTitle, jd } = body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const userId = await getDefaultUserId();
  const profile = await prisma.profileContext.findUnique({ where: { userId } });

  // ── Lightweight LLM call: extract 2 noun phrases from the JD ──
  const llmPrompt = `You are helping write a job application email.

Company: ${company}
Role: ${jobTitle}
${jd ? `Job Description:\n${jd.slice(0, 2000)}` : ""}

Return ONLY a valid JSON object with exactly two fields:
1. "companyMission": A short noun phrase (5-12 words) describing what this company is building. Complete the sentence "Your vision of building ___". Do NOT write a full sentence. Example: "an AI-powered contextual advertising platform"
2. "matchedStrengths": A short noun phrase (4-10 words) matching the JD to a PM with AI product and 0-1 execution experience. Complete the sentence "Given my background in ___". Do NOT write a full sentence. Example: "0-1 product delivery and generative AI integration"

Return ONLY the JSON, no markdown fences, no explanation.`;

  // Fallback values used if Gemini call fails
  let companyMission = "innovative technology solutions";
  let matchedStrengths = "0-1 product delivery and AI-powered feature development";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: llmPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.companyMission) companyMission = parsed.companyMission;
      if (parsed.matchedStrengths) matchedStrengths = parsed.matchedStrengths;
    }
  } catch (e) {
    console.warn("[generate-email] LLM call failed, using fallback values:", e);
  }

  // ── Build the email using the hardcoded outreach template ──
  const rawText = generateSimpleEmail(
    recipientName || "{{contactName}}",
    company,
    jobTitle,
    companyMission,
    matchedStrengths,
    profile || undefined
  );

  // ── Convert to HTML for Gmail ──
  let htmlBody = `<body style="font-family: Arial, Helvetica, sans-serif; color: #000; line-height: 1.5; font-size: 14px;">\n`;
  const sections = rawText.split("For your reference:");
  const mainBody = sections[0].trim();
  const paragraphs = mainBody.split("\n\n");

  for (const para of paragraphs) {
    if (para.includes("• ")) {
      htmlBody += `  <ul style="margin: 0; padding-left: 20px;">\n`;
      const lines = para.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        htmlBody += `    <li style="margin-bottom: 8px; margin-left: 15px;">${line.replace("• ", "")}</li>\n`;
      }
      htmlBody += `  </ul>\n`;
    } else {
      const formattedPara = para.split("\n").join("<br>");
      htmlBody += `  <p>${formattedPara}</p>\n`;
    }
  }

  const portfolio = profile?.portfolioUrl || "[Your Portfolio URL]";
  const phone = profile?.phone || "[Your Phone Number]";
  const linkedin = profile?.linkedinUrl || "[Your LinkedIn URL]";
  const cv = profile?.resume || "[Your CV URL]";
  htmlBody += `  <p>For your reference, you can view my <a href="${portfolio}" style="color:#0366d6; text-decoration:underline;">Portfolio</a> (reachable at ${phone}), connect with me on <a href="${linkedin}" style="color:#0366d6; text-decoration:underline;">LinkedIn</a>, or review my <a href="${cv}" style="color:#0366d6; text-decoration:underline;">CV</a>.</p>\n`;
  htmlBody += `</body>`;

  const subject = `Application: ${jobTitle} — ${company}`;

  return NextResponse.json({
    drafts: [{
      subject,
      htmlBody,
      rawText: mainBody,
      reason: `Generated for ${company} — ${jobTitle}`,
      problemTitle: `${company} — ${jobTitle}`,
    }],
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
