/**
 * Phase 4a: Gemini writes a single personalized sentence for the cold email
 *
 * Replaces: "Message a model" node (cleaned up — ONE task only)
 */

import { ask } from "../automation/llm";
import { vaultStore } from "../email-generator/vault";

export async function personalizeReason(
  company: string,
  jobTitle: string,
  jd?: string,
  companyReason?: string,
  mySummary?: string
): Promise<string> {
  // Fetch user's artifacts from the vault to ground the email
  const evidenceDocs = await vaultStore.getTopByRecency("evidence", 5);
  const evidenceText = evidenceDocs
    .map((doc, i) => `[Artifact ${i + 1}: ${doc.title}]\n${doc.content}`)
    .join("\n\n");

  const prompt = `You are an expert cold-email copywriter writing a job application email.
  
Company: ${company}
Role: ${jobTitle}
Job description: ${jd || "Not provided"}
${mySummary ? `Candidate summary: ${mySummary}` : ""}
${companyReason ? `IMPORTANT KEYWORDS / REASONS PROVIDED BY USER: "${companyReason}"` : ""}

My Background Evidence (USE THIS TO PROVE QUALIFICATIONS):
${evidenceText || "No artifacts uploaded. Use general best practices."}

Task: Write the ENTIRE main body of the email. Do NOT write the greeting ("Hi [Name]") or the sign-off ("Best regards").
You must write 3 sections:
1. The Intro: A strong, tailored opening sentence expressing excitement and highlighting the most relevant aspect of my background for this specific role.
2. "A little bit about myself:" followed by a bulleted list (max 3 bullets) of my most relevant achievements from the Evidence that directly match the Job Description. DO NOT invent achievements.
3. "Why ${company}?" followed by a 1-2 sentence paragraph weaving in the user's provided keywords (if any) and explaining alignment with the company.

Formatting Rules:
- Return ONLY HTML. No markdown code blocks, no \`\`\`html.
- Use <p> tags for paragraphs, with standard spacing.
- For the bulleted list, use standard <ul> (do NOT add margin-left: 0, as Gmail strips bullets if margins are zeroed).
- For each bullet point, use exactly this tag: <li style="margin-bottom: 8px; margin-left: 15px;">
- Be highly specific. If the JD asks for Finance, BCOM, BBA, highlight my finance background from the artifacts.`;

  const raw = await ask(prompt);
  // Strip any markdown code blocks Gemini might wrap it in
  return raw.replace(/^```html\n|```\n?$/g, "").trim();
}
