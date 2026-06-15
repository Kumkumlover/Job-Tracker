import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Fetch the User ID for the default Gmail account
 * so that we can link our data safely until NextAuth is fully integrated here.
 */
export async function getDefaultUserId(): Promise<string> {
  const email = process.env.SMTP_USER || "shikharguptah2@gmail.com";
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "Shikhar Gupta",
      },
    });
  }

  // Auto-seed ProfileContext if it doesn't exist so user doesn't have to re-enter data
  const profile = await prisma.profileContext.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    await prisma.profileContext.create({
      data: {
        userId: user.id,
        resume: "https://shikhargupta.com/resume.pdf",
        portfolioUrl: "https://shikhargupta.com",
        phone: "+91 9540443422",
        senderName: "Shikhar Gupta",
        linkedinUrl: "https://www.linkedin.com/in/shikhargupta",
        skills: "Full-stack development, Next.js, Node.js, AI Integration, Growth Engineering",
        background: "Software engineer and founder focused on building agentic workflows and AI-powered tools.",
      }
    });
  }

  return user.id;
}
