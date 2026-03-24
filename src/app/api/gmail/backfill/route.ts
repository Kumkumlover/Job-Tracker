import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { processBackfill } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const results = await processBackfill(user.id);
    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
