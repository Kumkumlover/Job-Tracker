import { prisma } from "./prisma";

export type ApiUsagePayload = {
  serper?: number;
  apollo?: number;
  hunter?: number;
  gemini?: number;
  tavily?: number;
  exa?: number;
  search?: number;
};

/**
 * Atomically increments the local API usage counters for a user.
 */
export async function incrementLocalApiUsage(userId: string, usage: ApiUsagePayload) {
  if (!userId) return;

  const data: any = {};
  if (usage.serper) data.serper = { increment: usage.serper };
  if (usage.apollo) data.apollo = { increment: usage.apollo };
  if (usage.hunter) data.hunter = { increment: usage.hunter };
  if (usage.gemini) data.gemini = { increment: usage.gemini };
  if (usage.tavily) data.tavily = { increment: usage.tavily };
  if (usage.exa) data.exa = { increment: usage.exa };
  if (usage.search) data.search = { increment: usage.search };

  if (Object.keys(data).length === 0) return;

  try {
    await prisma.localApiUsage.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        serper: usage.serper || 0,
        apollo: usage.apollo || 0,
        hunter: usage.hunter || 0,
        gemini: usage.gemini || 0,
        tavily: usage.tavily || 0,
        exa: usage.exa || 0,
        search: usage.search || 0,
      },
    });
  } catch (error) {
    console.error("[UsageTracker] Failed to increment local API usage:", error);
  }
}
