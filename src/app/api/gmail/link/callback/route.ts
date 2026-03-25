import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL || `https://${request.headers.get("host")}`;

  if (error || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?error=gmail_link_failed`);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/gmail/link/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get the email address of the consented account
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) {
      return NextResponse.redirect(`${baseUrl}/settings?error=gmail_link_failed`);
    }

    await prisma.linkedGmailAccount.upsert({
      where: { userId_email: { userId: state, email: userInfo.email } },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
      },
      create: {
        userId: state,
        email: userInfo.email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
      },
    });

    return NextResponse.redirect(`${baseUrl}/settings?success=gmail_linked`);
  } catch (err) {
    console.error("[Gmail Link Callback]", err);
    return NextResponse.redirect(`${baseUrl}/settings?error=gmail_link_failed`);
  }
}
