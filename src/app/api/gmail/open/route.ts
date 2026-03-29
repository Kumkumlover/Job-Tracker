import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Client-side redirect preserves URL fragments (server redirect drops #hash)
function clientRedirect(url: string) {
  const escaped = url.replace(/"/g, "&quot;");
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${escaped}"><script>window.location.href="${escaped}";</script></head><body>Redirecting to Gmail...</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function buildGmailUrl(account: string | null, messageId: string) {
  if (account) {
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#inbox/${messageId}`;
  }
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.redirect(new URL("/auth/signin", request.url));

  const touchpointId = request.nextUrl.searchParams.get("tp");
  const debug = request.nextUrl.searchParams.get("debug") === "1";

  if (!touchpointId) {
    return NextResponse.json({ error: "Missing tp parameter" }, { status: 400 });
  }

  // Look up the specific touchpoint
  const tp = await prisma.touchpoint.findUnique({
    where: { id: touchpointId },
    include: { application: { select: { userId: true } } },
  });

  if (!tp || tp.application.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!tp.emailMessageId) {
    return NextResponse.json({ error: "No email message ID on this touchpoint" }, { status: 400 });
  }

  // Use gmailAccount from metadata — this is the source of truth
  const meta = tp.metadata as Record<string, string> | null;
  const gmailAccount = meta?.gmailAccount || null;

  const url = buildGmailUrl(gmailAccount, tp.emailMessageId);

  if (debug) {
    return NextResponse.json({
      touchpointId: tp.id,
      emailMessageId: tp.emailMessageId,
      gmailAccount,
      metadata: meta,
      source: tp.source,
      redirectUrl: url,
    });
  }

  console.log(`[Gmail Open] tp=${tp.id} account=${gmailAccount} msgId=${tp.emailMessageId}`);
  return clientRedirect(url);
}
