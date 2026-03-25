import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.linkedGmailAccount.findMany({
    where: { userId: user.id },
    select: { id: true, email: true, lastSyncedAt: true, backfillDone: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(accounts);
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  await prisma.linkedGmailAccount.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
