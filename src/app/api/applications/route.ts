import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { normalizeForDedup } from "@/lib/utils";
import { z } from "zod";

const createSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  platform: z.string().default("manual"),
  status: z.string().default("applied"),
  dateApplied: z.string().optional(),
  followUpDate: z.string().optional(),
  jobUrl: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.string().optional(),
  salaryCurrency: z.string().default("INR"),
  location: z.string().optional(),
  locationType: z.string().optional(),
  notes: z.string().optional(),
  linkedinDmSent: z.boolean().default(false),
  jobDescription: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const platform = searchParams.get("platform") || "";
  const sortBy = searchParams.get("sortBy") || "dateApplied";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = { userId: user.id };

  if (search) {
    where.OR = [
      { company: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
      { location: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (platform) where.platform = platform;

  const applications = await prisma.application.findMany({
    where,
    include: {
      touchpoints: { orderBy: { date: "desc" } },
      customValues: { include: { customProperty: true } },
    },
    orderBy: { [sortBy]: sortOrder },
  });

  return NextResponse.json(applications);
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  const normalizedCompany = normalizeForDedup(data.company);
  const normalizedRole = normalizeForDedup(data.role);

  // Check for existing application
  const existing = await prisma.application.findFirst({
    where: {
      userId: user.id,
      company: { equals: normalizedCompany, mode: "insensitive" },
      role: { equals: normalizedRole, mode: "insensitive" },
    },
  });

  if (existing) {
    return NextResponse.json(
      { existing, message: "Application already exists" },
      { status: 409 }
    );
  }

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      company: data.company.trim(),
      role: data.role.trim(),
      platform: data.platform,
      status: data.status,
      dateApplied: data.dateApplied ? new Date(data.dateApplied) : new Date(),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      jobUrl: data.jobUrl || null,
      salaryMin: data.salaryMin || null,
      salaryMax: data.salaryMax || null,
      salaryCurrency: data.salaryCurrency,
      location: data.location || null,
      locationType: data.locationType || null,
      notes: data.notes || null,
      linkedinDmSent: data.linkedinDmSent,
      jobDescription: data.jobDescription || null,
    },
    include: {
      touchpoints: true,
      customValues: { include: { customProperty: true } },
    },
  });

  return NextResponse.json(application, { status: 201 });
}
