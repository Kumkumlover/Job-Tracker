import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Usage: /api/debug/company?name=rooter
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = request.nextUrl.searchParams.get("name") || "";

  const applications = await prisma.application.findMany({
    where: {
      userId: user.id,
      company: { contains: name, mode: "insensitive" },
    },
    include: {
      touchpoints: {
        orderBy: { date: "desc" },
      },
    },
  });

  return NextResponse.json(
    applications.map((app) => ({
      id: app.id,
      company: app.company,
      role: app.role,
      status: app.status,
      platform: app.platform,
      dateApplied: app.dateApplied,
      touchpoints: app.touchpoints.map((tp) => ({
        id: tp.id,
        type: tp.type,
        source: tp.source,
        date: tp.date,
        emailMessageId: tp.emailMessageId,
        metadata: tp.metadata,
      })),
    }))
  );
}
