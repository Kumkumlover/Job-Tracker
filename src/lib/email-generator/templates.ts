/**
 * Email Generator — Template Engine
 *
 * Generates the final email/message copy from a selected research problem.
 * Supports: Cold Email, Startup Pitch, Follow-up, LinkedIn DM.
 */

import type { ResearchProblem, OutputType } from "./types";

export function generateCopy(
  problem: ResearchProblem,
  outputType: OutputType,
  contactName: string,
  companyName: string,
  role: string,
  profile?: any // Using any to avoid importing Prisma types here which might cause circular issues or just keep it simple
): string {
  const name = contactName || "Hiring Manager";
  const senderName = profile?.senderName || "[Your Name]";
  const portfolio = profile?.portfolioUrl || "[Your Portfolio URL]";
  const phone = profile?.phone || "[Your Phone Number]";
  const linkedin = profile?.linkedinUrl || "[Your LinkedIn URL]";
  const cv = profile?.resume || "[Your CV URL]";
  
  const defaultBullets = `• Led development of core features resulting in 20% efficiency gain.
• Experienced in driving cross-functional collaboration and delivering high-impact features.
• Demonstrated ability to scale systems from 0-1.`;
  const bullets = problem.aboutMeBullets || profile?.aboutMeBullets || defaultBullets;

  // Custom Template Logic
  if (profile?.emailTemplateStructure && outputType === "Cold Email") {
    let tpl = profile.emailTemplateStructure;
    tpl = tpl.replace(/{{contactName}}/g, name);
    tpl = tpl.replace(/{{companyName}}/g, companyName);
    tpl = tpl.replace(/{{role}}/g, role);
    tpl = tpl.replace(/{{companyMission}}/g, problem.companyMission);
    tpl = tpl.replace(/{{matchedStrengths}}/g, problem.matchedStrengths);
    tpl = tpl.replace(/{{aboutMeBullets}}/g, bullets);
    tpl = tpl.replace(/{{portfolioUrl}}/g, portfolio);
    tpl = tpl.replace(/{{phone}}/g, phone);
    tpl = tpl.replace(/{{linkedinUrl}}/g, linkedin);
    tpl = tpl.replace(/{{resumeUrl}}/g, cv);
    tpl = tpl.replace(/{{senderName}}/g, senderName);
    return tpl;
  }

  if (outputType === "Cold Email") {
    const hookLine = (problem.linkedinHook && problem.linkedinHook.trim() !== "") 
      ? `\n\n${problem.linkedinHook}`
      : "";

    return `Hi ${name},${hookLine}

I came across your post about ${companyName}'s search for a ${role}, and I couldn't be more excited! Your vision of building ${problem.companyMission} resonates deeply with me. Given my background in ${problem.matchedStrengths}, I'd love to explore how I can contribute to this journey.

A little bit about myself:

${bullets}

Why am I writing to you?

I'm interested in applying for the ${role} role at ${companyName}. I look forward to interviewing with the team. Thank you for considering my application.

For your reference:
• Portfolio: ${portfolio} (Reachable at ${phone})
• LinkedIn: ${linkedin}
• CV: ${cv}

Best,
${senderName}`;
  }

  if (outputType === "Startup Pitch") {
    const greeting = contactName || "there";
    return `Hi ${greeting},

I've been following ${companyName}'s recent growth and love what you're building! ${problem.speculativePitch}

Given that you are scaling rapidly, I wanted to reach out directly in case you are looking to bring on a strong 0-1 Product Manager.

A little bit about myself:

${bullets}

Based on your product, I put together a quick hypothesis:

• Challenge: ${problem.problem}
• Hypothesis: ${problem.hypothesis}

${problem.hook}

If you're open to expanding your product team, I'd love to connect for a brief 10-minute chat.

For your reference:
• Portfolio: ${portfolio} (Reachable at ${phone})
• LinkedIn: ${linkedin}
• CV: ${cv}

Best,
${senderName}`;
  }

  if (outputType === "Follow-up") {
    const greeting = contactName || "there";
    return `Subject: Following up | APM Application | Hypothesis for ${companyName}'s ${problem.title}

Hi ${greeting},

I'm sending this as a final note to close the loop on my end. I wanted to leave you with a specific product thought regarding ${companyName}'s friction points that I came across while researching your model.

• The Challenge: ${problem.problem}
• The Idea: ${problem.hypothesis}
• The Goal: ${problem.pmGoal}

${problem.hook}

I specialize in 0-1 execution and driving user adoption. If you're open to a 10-minute chat, I'd love to connect.

Best,
${senderName}`;
  }

  // LinkedIn DM
  const greeting = `Hi ${contactName || "there"},`;
  if (problem.linkedinHook && problem.linkedinHook.trim() !== "") {
    return `${greeting}

${problem.linkedinHook}

I've been analyzing ${companyName}'s product and wanted to share a hypothesis regarding ${problem.title}.

• Challenge: ${problem.problem}
• Hypothesis: ${problem.hypothesis}

${problem.hook}

I'd love to send over the full logic if you're curious. Cheers!`;
  }

  return `${greeting} following ${companyName}'s work and wanted to share a hypothesis regarding ${problem.title}.

• Challenge: ${problem.problem}
• Hypothesis: ${problem.hypothesis}

${problem.hook}

I'd love to send over the full logic if you're curious. Cheers!`;
}

// ─── Outreach Automation Template ───────────────────────────────
//
// Used ONLY by the outreach automation flow (api/outreach generate-email).
// Hardcoded bullets — no RAG, no LinkedIn scraping, zero hallucination risk.
// The standalone /email-generator tool continues to use generateCopy above.

const OUTREACH_BULLETS = `• I am Shikhar Gupta, an AI Product Intern at SuperAGI (AI CRM), currently owning end-to-end discovery and execution for Analytics, Chat, and Project Management modules, built them from 0–1 and replaced tools like Slack and Jira for internal usage saving more than 150k in cost.
• I have led the development of multiple AI-agents including an AI onboarding agent that reduced customer success costs by 60% and a chat-native PM agent that automated task tracking and reduced project management overhead by 40% in SuperAGI.
• I am a Top PM fellow at Nextleap (Top 10%), Ex Product Analyst @Digital Harbor and have built multiple AI automations such as a targeted cold outreach tool and a job tracker CRM as a browser extension.`;

export function generateSimpleEmail(
  contactName: string,
  companyName: string,
  role: string,
  companyMission: string,
  matchedStrengths: string,
  profile?: any
): string {
  const name = contactName || "Hiring Manager";
  const senderName = profile?.senderName || "Shikhar Gupta";
  const portfolio = profile?.portfolioUrl || "[Your Portfolio URL]";
  const phone = profile?.phone || "[Your Phone Number]";
  const linkedin = profile?.linkedinUrl || "[Your LinkedIn URL]";
  const cv = profile?.resume || "[Your CV URL]";

  return `Hi ${name},

I came across your post about ${companyName}'s search for a ${role}, and I couldn't be more excited! Your vision of building ${companyMission} resonates deeply with me. Given my background in ${matchedStrengths}, I'd love to explore how I can contribute to this journey.

A little bit about myself:

${OUTREACH_BULLETS}

Why am I writing to you?

I have snapped my head while building AI agents more times than I'd like to admit. Coming from a non technical background, I've learnt to build and break automations embedding LLMs, write evals and understand their limitations out of genuine curiosity. If you are looking to add a forward deployed ${role} at ${companyName}, then I'd love to discuss this further.

For your reference:
• Portfolio: ${portfolio} (Reachable at ${phone})
• LinkedIn: ${linkedin}
• CV: ${cv}

Best,
${senderName}`;
}
