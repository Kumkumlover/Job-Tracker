/**
 * Phase 4b: Compose and send the outreach email via Gmail API
 *
 * Replaces: "Send email" node
 */

import type { OutboundEmail } from "../types";
import { getGmailClient } from "../gmail";

export function composeEmail(
  recipientName: string,
  companyReason: string,
  company: string,
  jobTitle: string,
  profileUrl?: string,
  profile?: any
): string {
  const greeting = recipientName ? `Hi ${recipientName}` : "Hi there";
  const portfolio = profile?.portfolioUrl || "[Your Portfolio URL]";
  const phone = profile?.phone || "[Your Phone Number]";
  const linkedin = profile?.linkedinUrl || "[Your LinkedIn URL]";
  const cv = profile?.resume || "[Your CV URL]";
  const senderName = profile?.senderName || "[Your Name]";

  return `<body style="font-family: Arial, Helvetica, sans-serif; color: #000; line-height: 1.5; font-size: 14px;">
  <p>${greeting},</p>
  
  ${companyReason}

  <p>I look forward to the opportunity to discuss how I can contribute to ${company}'s growth.</p>

  <p>For your reference, you can view my <a href="${portfolio}" style="color:#0366d6; text-decoration:underline;">Portfolio</a> (reachable at ${phone}), connect with me on <a href="${linkedin}" style="color:#0366d6; text-decoration:underline;">LinkedIn</a>, or review my <a href="${cv}" style="color:#0366d6; text-decoration:underline;">CV</a>.</p>

  <p>Best regards,<br>${senderName}</p>
  ${profileUrl ? `<div data-linkedin-url="${profileUrl}" style="display:none;">${profileUrl}</div>` : ''}
</body>`;
}

/** Create and send an email via Gmail API */
export async function sendOutboundEmail(
  email: OutboundEmail,
  userId: string
): Promise<{ messageId: string }> {
  const gmail = await getGmailClient(userId);

  // Construct raw RFC822 email
  const messageParts = [
    `To: ${email.to_name ? `"${email.to_name}" <${email.to_email}>` : email.to_email}`,
    `Subject: ${email.subject}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    email.html_body,
  ];
  
  const rawMessage = messageParts.join("\r\n");

  // Encode in base64url format
  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return { messageId: res.data.id || "unknown" };
}
