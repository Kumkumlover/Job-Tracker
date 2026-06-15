import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma, getDefaultUserId } from "@/lib/prisma";
import { Buffer } from "node:buffer";

export async function POST(request: Request) {
  try {
    const { toEmail, bccEmails, subject, htmlBody } = await request.json();

    if (!toEmail || !subject || !htmlBody) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get the active user
    const userId = await getDefaultUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { linkedGmailAccounts: true }
    });

    if (!user || user.linkedGmailAccounts.length === 0) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 401 });
    }

    const linkedAccount = user.linkedGmailAccounts[0];
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Google OAuth credentials not configured" }, { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

    oauth2Client.on('tokens', async (tokens) => {
      // Save newly refreshed tokens back to database
      if (tokens.access_token) {
        await prisma.linkedGmailAccount.update({
          where: { id: linkedAccount.id },
          data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || linkedAccount.refreshToken,
            expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null
          }
        });
      }
    });

    oauth2Client.setCredentials({
      access_token: linkedAccount.accessToken,
      refresh_token: linkedAccount.refreshToken,
      expiry_date: linkedAccount.expiresAt ? linkedAccount.expiresAt * 1000 : null
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Construct MIME email
    const boundary = "boundary_" + Math.random().toString(36).substring(2);
    let message = `To: ${toEmail}\r\n`;
    if (bccEmails) {
      message += `Bcc: ${bccEmails}\r\n`;
    }
    message += `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;

    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
    message += `${htmlBody.replace(/<[^>]*>/g, "")}\r\n\r\n`;

    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    message += `${htmlBody}\r\n\r\n`;

    message += `--${boundary}--`;

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: encodedMessage
        }
      }
    });

    return NextResponse.json({ success: true, draftId: res.data.id });
    } catch (error: any) {
      console.error("Failed to create draft via Gmail API:", error);
      return NextResponse.json({ error: "Failed to create draft: " + (error.message || error) }, { status: 500 });
    }
}
