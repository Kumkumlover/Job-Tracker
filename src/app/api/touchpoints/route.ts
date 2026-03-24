import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  applicationId: z.string().min(1),
  type: z.string().min(1),
  source: z.string().default("manual"),
  date: z.string().optional(),
  notes: z.string().optional(),
  emailMessageId: z.string().optional(),
  metadata: z.any().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  // Verify ownership of the application
  const application = await prisma.application.findFirst({
    where: { id: data.applicationId, userId: user.id },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const touchpoint = await prisma.touchpoint.create({
    data: {
      applicationId: data.applicationId,
      type: data.type,
      source: data.source,
      date: data.date ? new Date(data.date) : new Date(),
      notes: data.notes || null,
      emailMessageId: data.emailMessageId || null,
      metadata: (data.metadata as Record<string, string>) ?? undefined,
    },
  });

  return NextResponse.json(touchpoint, { status: 201 });
}
