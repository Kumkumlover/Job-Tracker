/**
 * Intelligence Store
 *
 * Replaces the JSON file with Prisma + Supabase.
 * Tracks API limits (in memory for now, or using a simple Map),
 * and persists Patterns, Emails, and Feedback to the database.
 */

import { prisma, getDefaultUserId } from "../prisma";

// ─── Data Types ─────────────────────────────────────────────────

export interface PatternRecord {
  pattern: string;
  domain: string | null; // null = global
  successCount: number;
  usageCount: number;
}

export interface CachedEmail {
  email: string;
  name: string;
  domain: string;
  pattern: string;
  confidence: number;
  source: string;
  verified: boolean;
}

export interface FeedbackRecord {
  email: string;
  status: "correct" | "incorrect";
  timestamp: string;
}

class IntelligenceStore {



  // ── Emails ──

  async getCachedEmails(name: string, domain: string): Promise<CachedEmail[]> {
    const userId = await getDefaultUserId();
    const emails = await prisma.cachedEmail.findMany({
      where: {
        userId,
        name: name.toLowerCase(),
        domain: domain.toLowerCase(),
      },
      orderBy: { confidence: 'desc' }
    });

    return emails.map(e => ({
      email: e.email,
      name: e.name,
      domain: e.domain,
      pattern: e.pattern,
      confidence: e.confidence,
      source: e.source,
      verified: e.verified,
    }));
  }

  async getCachedEmailsByDomain(domain: string): Promise<CachedEmail[]> {
    const userId = await getDefaultUserId();
    return prisma.cachedEmail.findMany({
      where: {
        userId,
        domain: domain.toLowerCase()
      }
    });
  }

  async saveEmail(
    email: string,
    name: string,
    domain: string,
    pattern: string,
    confidence: number,
    source: string,
    verified: boolean
  ): Promise<void> {
    const userId = await getDefaultUserId();

    await prisma.cachedEmail.upsert({
      where: {
        userId_name_domain: {
          userId,
          name: name.toLowerCase(),
          domain: domain.toLowerCase(),
        }
      },
      update: {
        email,
        pattern,
        confidence,
        source,
        verified,
      },
      create: {
        userId,
        email,
        name: name.toLowerCase(),
        domain: domain.toLowerCase(),
        pattern,
        confidence,
        source,
        verified,
      }
    });
  }

  // ── Patterns ──

  async recordPatternSuccess(pattern: string, domain: string): Promise<void> {
    const userId = await getDefaultUserId();

    // Update domain-specific pattern
    await this.upsertPattern(userId, pattern, domain, 1, 1);
    
    // Update global pattern
    await this.upsertPattern(userId, pattern, "global", 1, 1);
  }

  async recordPatternUsage(pattern: string, domain: string): Promise<void> {
    const userId = await getDefaultUserId();

    // Update domain-specific pattern
    await this.upsertPattern(userId, pattern, domain, 0, 1);
    
    // Update global pattern
    await this.upsertPattern(userId, pattern, "global", 0, 1);
  }

  private async upsertPattern(userId: string, pattern: string, domain: string, successInc: number, usageInc: number) {
    // We use "global" as a string for the domain field if it's null in logic, since unique constraints with null can be tricky.
    // Wait, the schema says domain String? (nullable). Let's use Prisma's upsert.
    
    const dbDomain = domain === "global" ? null : domain;

    // Prisma doesn't support upsert with nullable unique constraints perfectly in all DBs,
    // so we'll do a find and update/create.
    const existing = await prisma.patternRecord.findFirst({
      where: { userId, pattern, domain: dbDomain }
    });

    if (existing) {
      await prisma.patternRecord.update({
        where: { id: existing.id },
        data: {
          successCount: { increment: successInc },
          usageCount: { increment: usageInc }
        }
      });
    } else {
      await prisma.patternRecord.create({
        data: {
          userId,
          pattern,
          domain: dbDomain,
          successCount: successInc,
          usageCount: usageInc,
        }
      });
    }
  }

  // ── Feedback ──

  async logFeedback(email: string, status: "correct" | "incorrect"): Promise<void> {
    const userId = await getDefaultUserId();

    await prisma.feedbackEntry.create({
      data: {
        userId,
        email,
        status,
      }
    });

    const emailRecord = await prisma.cachedEmail.findFirst({
      where: { userId, email: email.toLowerCase() }
    });

    if (emailRecord) {
      const { pattern, domain } = emailRecord;

      if (status === "correct") {
        await this.recordPatternSuccess(pattern, domain);
        await prisma.cachedEmail.update({
          where: { id: emailRecord.id },
          data: { verified: true, confidence: 1.0 }
        });
      } else {
        await this.recordPatternUsage(pattern, domain);
        await prisma.cachedEmail.update({
          where: { id: emailRecord.id },
          data: { confidence: emailRecord.confidence * 0.5 }
        });
      }
    }
  }
  
  async getStoreStats() {
      const userId = await getDefaultUserId();
      const [patterns, emails, feedback] = await Promise.all([
          prisma.patternRecord.count({ where: { userId } }),
          prisma.cachedEmail.count({ where: { userId } }),
          prisma.feedbackEntry.count({ where: { userId } })
      ]);
      
      return {
          patterns,
          cachedEmails: emails,
          feedbackEntries: feedback,
          companiesTracked: 0, // Unused
      };
  }
  
  async getTopPatterns() {
      const userId = await getDefaultUserId();
      return prisma.patternRecord.findMany({
          where: { userId, domain: null },
          orderBy: { successCount: 'desc' },
          take: 10
      });
  }
  
  async getRecentFeedback() {
      const userId = await getDefaultUserId();
      return prisma.feedbackEntry.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5
      });
  }
}

export const store = new IntelligenceStore();
