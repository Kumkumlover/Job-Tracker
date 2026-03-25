import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { processBackfill } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Debug: check linked accounts directly
    const linkedDebug = await prisma.linkedGmailAccount.findMany({
      where: { userId: user.id },
      select: { id: true, email: true },
    });
    console.log(`[Backfill Route] userId=${user.id}, linkedAccounts=${JSON.stringify(linkedDebug)}`);

    const results = await processBackfill(user.id);
    return NextResponse.json({ ...results, _debug: { userId: user.id, linkedAccounts: linkedDebug } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
