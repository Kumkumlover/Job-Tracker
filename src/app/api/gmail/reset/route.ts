import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Deletes all gmail_scan touchpoints and resets backfill state,
// so next backfill recreates everything with correct metadata.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Delete all touchpoints created by gmail sync
  const deleted = await prisma.touchpoint.deleteMany({
    where: {
      source: "gmail_scan",
      application: { userId: user.id },
    },
  });

  // Reset primary backfill state
  await prisma.gmailSyncState.updateMany({
    where: { userId: user.id },
    data: { backfillDone: false, lastHistoryId: null },
  });

  // Reset linked accounts backfill state
  await prisma.linkedGmailAccount.updateMany({
    where: { userId: user.id },
    data: { backfillDone: false, lastSyncedAt: null },
  });

  // Clear emailThreadId from applications (they'll be re-set during backfill)
  await prisma.application.updateMany({
    where: { userId: user.id, emailThreadId: { not: null } },
    data: { emailThreadId: null },
  });

  return NextResponse.json({
    touchpointsDeleted: deleted.count,
    message: "Gmail data reset. Run Backfill to re-sync with correct metadata.",
  });
}
