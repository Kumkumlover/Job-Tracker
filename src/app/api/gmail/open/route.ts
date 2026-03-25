import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Server-side redirect to correct Gmail inbox for a touchpoint
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.redirect(new URL("/auth/signin", request.url));

  const touchpointId = request.nextUrl.searchParams.get("tp");
  const threadId = request.nextUrl.searchParams.get("thread");
  const appId = request.nextUrl.searchParams.get("app");

  let gmailAccount: string | null = null;
  let messageId: string | null = null;

  if (touchpointId) {
    // Opening a specific touchpoint email
    const tp = await prisma.touchpoint.findUnique({
      where: { id: touchpointId },
      include: { application: { select: { userId: true } } },
    });
    if (!tp || tp.application.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    messageId = tp.emailMessageId;
    const meta = tp.metadata as Record<string, string> | null;
    gmailAccount = meta?.gmailAccount || null;

    // If no gmailAccount in metadata, try to determine from linked accounts
    if (!gmailAccount && tp.source === "gmail_scan") {
      const linked = await prisma.linkedGmailAccount.findMany({
        where: { userId: user.id },
        select: { email: true },
      });
      if (linked.length === 1) {
        // Only one linked account - must be from it
        gmailAccount = linked[0].email;
      }
    }
  } else if (threadId && appId) {
    // Opening an email thread for an application
    const app = await prisma.application.findFirst({
      where: { id: appId, userId: user.id },
      include: { touchpoints: { where: { source: "gmail_scan" }, take: 1 } },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    messageId = threadId;
    // Check touchpoint metadata for account
    if (app.touchpoints[0]) {
      const meta = app.touchpoints[0].metadata as Record<string, string> | null;
      gmailAccount = meta?.gmailAccount || null;
    }
    if (!gmailAccount) {
      const linked = await prisma.linkedGmailAccount.findMany({
        where: { userId: user.id },
        select: { email: true },
      });
      if (linked.length === 1) gmailAccount = linked[0].email;
    }
  }

  if (!messageId) {
    return NextResponse.json({ error: "No message ID" }, { status: 400 });
  }

  // Debug mode - return JSON instead of redirecting
  if (request.nextUrl.searchParams.get("debug") === "1") {
    const linkedAccounts = await prisma.linkedGmailAccount.findMany({
      where: { userId: user.id },
      select: { id: true, email: true },
    });
    let tpData = null;
    if (touchpointId) {
      tpData = await prisma.touchpoint.findUnique({ where: { id: touchpointId } });
    }
    return NextResponse.json({
      userId: user.id,
      gmailAccount,
      messageId,
      linkedAccounts,
      touchpoint: tpData ? {
        id: tpData.id,
        source: tpData.source,
        emailMessageId: tpData.emailMessageId,
        metadata: tpData.metadata,
      } : null,
    });
  }

  // Build Gmail URL
  const url = gmailAccount
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(gmailAccount)}#inbox/${messageId}`
    : `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  console.log(`[Gmail Open] account=${gmailAccount}, messageId=${messageId}, url=${url}`);

  return NextResponse.redirect(url);
}
