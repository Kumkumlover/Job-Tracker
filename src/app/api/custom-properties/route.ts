import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import slugify from "slugify";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("text"),
  options: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const properties = await prisma.customProperty.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(properties);
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
  const slug = slugify(data.name, { lower: true, strict: true });

  // Get next sort order
  const maxOrder = await prisma.customProperty.findFirst({
    where: { userId: user.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const property = await prisma.customProperty.create({
    data: {
      userId: user.id,
      name: data.name,
      slug,
      type: data.type,
      options: data.options ?? undefined,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(property, { status: 201 });
}
