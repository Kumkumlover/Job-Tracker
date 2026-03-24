import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { normalizeForDedup } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company, role } = await request.json();
  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 }
    );
  }

  const normalizedCompany = normalizeForDedup(company);
  const normalizedRole = normalizeForDedup(role);

  const application = await prisma.application.findFirst({
    where: {
      userId: user.id,
      company: { equals: normalizedCompany, mode: "insensitive" },
      role: { equals: normalizedRole, mode: "insensitive" },
    },
    include: { touchpoints: true },
  });

  if (application) {
    return NextResponse.json({ exists: true, application });
  }

  return NextResponse.json({ exists: false });
}
