import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = request.headers.get("host") || "";
  const baseUrl = (process.env.NEXTAUTH_URL || `https://${host}`).replace(/\/$/, "");
  // Always use production URL on Vercel regardless of NEXTAUTH_URL value
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${baseUrl}/api/gmail/link/callback`;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    state: (session.user as { id: string }).id,
  });

  return NextResponse.redirect(url);
}
