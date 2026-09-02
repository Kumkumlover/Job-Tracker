import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { smartSync } from "@/lib/gmail";

export const maxDuration = 60;

// POST /api/gmail/sync          → incremental (auto-detects full if first run)
// POST /api/gmail/sync?mode=full → force full 3-month scan
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = request.nextUrl.searchParams.get("mode") === "full" ? "full" : "incremental";

  try {
    const results = await smartSync(user.id, mode);
    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
