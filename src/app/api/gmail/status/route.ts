import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await prisma.user.findFirst({
      include: { linkedGmailAccounts: true }
    });

    if (!user || user.linkedGmailAccounts.length === 0) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({ 
      connected: true, 
      email: user.linkedGmailAccounts[0].email 
    });
  } catch (error) {
    console.error("Failed to check Gmail status:", error);
    return NextResponse.json({ connected: false }, { status: 500 });
  }
}
