/**
 * Phase 4b: Compose and send the outreach email via SMTP
 *
 * Replaces: "Send email" node
 */

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { OutboundEmail } from "../types";

function getImapClient() {
  return new ImapFlow({
    host: process.env.SMTP_HOST?.replace("smtp", "imap") ?? "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    logger: false,
  });
}

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

/** Create a Draft in Gmail via IMAP */
export async function sendOutboundEmail(
  email: OutboundEmail
): Promise<{ messageId: string }> {
  const client = getImapClient();
  await client.connect();

  try {
    const mailOptions = {
      from: `"${email.senderName || '[Your Name]'}" <${process.env.SMTP_USER}>`,
      to: email.to_email,
      subject: email.subject,
      html: email.html_body,
    };

    const mail = new MailComposer(mailOptions);
    const rawEml = await mail.compile().build();

    const appendRes = await client.append("[Gmail]/Drafts", rawEml, ["\\Draft"]);
    const messageId = appendRes && typeof appendRes !== "boolean" && "uid" in appendRes 
      ? appendRes.uid?.toString() 
      : "draft-created";
    
    return { messageId: messageId || "draft-created" };
  } finally {
    await client.logout();
  }
}
