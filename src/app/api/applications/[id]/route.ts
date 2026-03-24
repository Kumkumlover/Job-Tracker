import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findFirst({
    where: { id, userId: user.id },
    include: {
      touchpoints: { orderBy: { date: "desc" } },
      customValues: { include: { customProperty: true } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(application);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Verify ownership
  const existing = await prisma.application.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Handle custom values separately
  const { customValues, ...applicationData } = body;

  // Convert date strings to Date objects
  if (applicationData.dateApplied)
    applicationData.dateApplied = new Date(applicationData.dateApplied);
  if (applicationData.followUpDate)
    applicationData.followUpDate = new Date(applicationData.followUpDate);
  if (applicationData.followUpDate === "")
    applicationData.followUpDate = null;

  const application = await prisma.application.update({
    where: { id },
    data: applicationData,
    include: {
      touchpoints: { orderBy: { date: "desc" } },
      customValues: { include: { customProperty: true } },
    },
  });

  // Upsert custom values if provided
  if (customValues && typeof customValues === "object") {
    for (const [propertyId, value] of Object.entries(customValues)) {
      if (value === null || value === "") {
        await prisma.customValue.deleteMany({
          where: { applicationId: id, customPropertyId: propertyId },
        });
      } else {
        await prisma.customValue.upsert({
          where: {
            applicationId_customPropertyId: {
              applicationId: id,
              customPropertyId: propertyId,
            },
          },
          update: { value: String(value) },
          create: {
            applicationId: id,
            customPropertyId: propertyId,
            value: String(value),
          },
        });
      }
    }
  }

  // Re-fetch with updated custom values
  const updated = await prisma.application.findUnique({
    where: { id },
    include: {
      touchpoints: { orderBy: { date: "desc" } },
      customValues: { include: { customProperty: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.application.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.application.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
