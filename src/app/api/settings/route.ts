import { NextRequest, NextResponse } from "next/server";
import { prisma, getDefaultUserId } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    let profile = await prisma.profileContext.findUnique({
      where: { userId },
    });
    
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!profile) {
      profile = await prisma.profileContext.create({
        data: {
          userId,
          senderName: "Shikhar Gupta",
        },
      });
    }

    const defaultBullets = `• I am Shikhar Gupta, an AI Product Intern at SuperAGI (AI CRM), currently owning end-to-end discovery and execution for Analytics, Chat, and Project Management modules, built them from 0–1 and replaced tools like Slack and Jira for internal usage saving more than 150k in cost.
• I have led the development of multiple AI-agents including an AI onboarding agent that reduced customer success costs by 60% and a chat-native PM agent that automated task tracking and reduced project management overhead by 40% in SuperAGI.
• I am a Top PM fellow at Nextleap (Top 10%), Ex Product Analyst @Digital Harbor and have vibecoded automations such as Job email outreach using N8N and Job tracker as a browser extension.`;

    const defaultSystemPrompt = `1. Identify 3 critical UX or product friction points for the target company.
2. Cross-reference the EVIDENCE LIBRARY to solve the problem.
3. 'hook': MUST cite the exact TITLE of the document you used from the Evidence Library to prove you can solve the problem.
4. 'companyMission': Write a short noun phrase completing the sentence "Your vision of building...". DO NOT repeat "Your vision of building" or write a full sentence. Example: "an intuitive clinical AI ecosystem".
5. 'matchedStrengths': Analyze the [JOB DESCRIPTION]. Select 2 hard skills/metrics from my EVIDENCE LIBRARY that align perfectly with the JD. Write a short phrase completing "Given my background in...". DO NOT write a full sentence. DO NOT repeat "Given my background in". Example: "0-1 product delivery and scaling AI agents".
6. 'linkedinHook': If a LEAD LINKEDIN URL is provided, formulate a personalized, warm 1-2 sentence opening hook using the [LEAD SCRAPED CONTEXT]. If context is missing, use Google Search. DO NOT return an empty string if a URL is provided. ONLY return "" if LEAD LINKEDIN URL is 'None provided'.
7. 'speculativePitch': Analyze the [COMPANY WEBSITE CONTEXT]. Write a 1-2 sentence observation identifying their core product value proposition and 1-2 likely competitors/alternatives in their space. Frame this as an exciting challenge for a 0-1 Product Manager to tackle.`;

    const defaultTemplate = `Hi {{contactName}},

I came across your post about {{companyName}}'s search for a {{role}}, and I couldn't be more excited! Your vision of building {{companyMission}} resonates deeply with me. Given my background in {{matchedStrengths}}, I'd love to explore how I can contribute to this journey.

A little bit about myself:

{{aboutMeBullets}}

Why am I writing to you?

I'm interested in applying for the {{role}} role at {{companyName}}. I look forward to interviewing with the team. Thank you for considering my application.

For your reference:
• Portfolio: {{portfolioUrl}} (Reachable at {{phone}})
• LinkedIn: {{linkedinUrl}}
• CV: {{resumeUrl}}

Best,
{{senderName}}`;

    const populatedProfile = {
      ...profile,
      senderName: profile.senderName || "Shikhar Gupta",
      phone: profile.phone || "+91 7987177269",
      portfolioUrl: profile.portfolioUrl || "https://shikharpmg.onhercules.app/",
      linkedinUrl: profile.linkedinUrl || "https://www.linkedin.com/in/shikhar-gupta-505b0b21b/",
      resumeUrl: profile.resume || "https://assets.nextleap.app/user-resume/ShikharCV-a4a6863b-b8f8-4699-9370-db5da8104ad9.pdf",
      aboutMeBullets: profile.aboutMeBullets || defaultBullets,
      emailTemplateStructure: profile.emailTemplateStructure || defaultTemplate,
      systemPrompt: profile.systemPrompt || defaultSystemPrompt,
    };

    return NextResponse.json({ 
      profile: populatedProfile,
      apiKeys: {
        hunterKey: user?.hunterKey || "",
        apolloKey: user?.apolloKey || "",
        serperKey: user?.serperKey || "",
        geminiKey: user?.geminiKey || "",
        tavilyKey: user?.tavilyKey || "",
        exaKey: user?.exaKey || ""
      }
    });
  } catch (err) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await req.json();

    const updated = await prisma.profileContext.upsert({
      where: { userId },
      update: {
        senderName: body.senderName,
        portfolioUrl: body.portfolioUrl,
        linkedinUrl: body.linkedinUrl,
        resume: body.resumeUrl,
        phone: body.phone,
        aboutMeBullets: body.aboutMeBullets,
        emailTemplateStructure: body.emailTemplateStructure,
        systemPrompt: body.systemPrompt,
      },
      create: {
        userId,
        senderName: body.senderName,
        portfolioUrl: body.portfolioUrl,
        linkedinUrl: body.linkedinUrl,
        resume: body.resumeUrl,
        phone: body.phone,
        aboutMeBullets: body.aboutMeBullets,
        emailTemplateStructure: body.emailTemplateStructure,
        systemPrompt: body.systemPrompt,
      },
    });

    // Also update API keys if provided
    const userUpdateData: any = {};
    if (body.hunterKey !== undefined) userUpdateData.hunterKey = body.hunterKey;
    if (body.apolloKey !== undefined) userUpdateData.apolloKey = body.apolloKey;
    if (body.serperKey !== undefined) userUpdateData.serperKey = body.serperKey;
    if (body.geminiKey !== undefined) userUpdateData.geminiKey = body.geminiKey;
    if (body.tavilyKey !== undefined) userUpdateData.tavilyKey = body.tavilyKey;
    if (body.exaKey !== undefined) userUpdateData.exaKey = body.exaKey;

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userUpdateData
      });
    }

    return NextResponse.json({ success: true, profile: updated });
  } catch (err) {
    console.error("POST /api/settings error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
