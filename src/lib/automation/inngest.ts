import { Inngest } from "inngest";
import type { ApplyPayload } from "../types";
import { searchCandidates } from "../pipeline/search";
import { rankCandidates } from "../pipeline/rank";
import { discoverEmails } from "../pipeline/discover-emails";
import { findFirstValidEmail, validateEmail } from "../pipeline/validate";
import { personalizeReason } from "../pipeline/personalize";
import { composeEmail, sendOutboundEmail } from "../pipeline/send";
import { prisma, getDefaultUserId } from "../prisma";

export const inngest = new Inngest({
  id: "job-apply-automation",
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

/**
 * The main pipeline function.
 *
 * Each step.run() is durable — if it fails, Inngest retries just that step.
 * Each step gets its own timeout, so the total pipeline can run for minutes
 * even on Vercel's 10-second hobby plan.
 */
export const applyPipeline = inngest.createFunction(
  {
    id: "job-apply-pipeline",
    retries: 1,
    concurrency: 1,
    triggers: [{ event: "app/job.apply" }],
  },
  async ({ event, step }: { event: { data: ApplyPayload }; step: any }) => {
    const payload = event.data;

    // ─── Phase 1: Routing ───
    // If recipient_email is provided, skip the entire search pipeline
    if (payload.recipient_email?.trim()) {
      const email = payload.recipient_email.trim();

      const validation = await step.run("validate-provided-email", async () => {
        return await validateEmail(email);
      });

      if (!validation.mx_ok || !validation.domain_ok) {
        return {
          status: "failed",
          reason: "provided_email_invalid",
          validation,
        };
      }

      const reason = await step.run("personalize", async () => {
        return await personalizeReason(
          payload.company,
          payload.job_title,
          payload.jd,
          payload.company_reason,
          payload.my_summary
        );
      });

      const result = await step.run("send-email", async () => {
        const userId = await getDefaultUserId();
        const profile = await prisma.profileContext.findUnique({ where: { userId } });
        
        const html = composeEmail(
          payload.recipient_name ?? "",
          reason,
          payload.company,
          payload.job_title,
          undefined,
          profile || undefined
        );
        return await sendOutboundEmail({
          to_email: email,
          to_name: payload.recipient_name ?? "",
          subject: `Application: ${payload.job_title} — ${payload.company}`,
          html_body: html,
          company: payload.company,
          job_title: payload.job_title,
        }, userId);
      });

      return { status: "sent", email, messageId: result.messageId };
    }

    // ─── Phase 2: Search & Rank ───
    const searchResults = await step.run("search-candidates", async () => {
      return await searchCandidates(payload.company, payload.job_title);
    });

    if (!searchResults.length) {
      return { status: "failed", reason: "no_search_results" };
    }

    const rankedCandidates = await step.run("rank-candidates", async () => {
      return await rankCandidates(
        searchResults,
        payload.company,
        payload.job_title,
        payload.jd
      );
    });

    if (!rankedCandidates.length) {
      return { status: "failed", reason: "no_candidates_ranked" };
    }

    // ─── Phase 3: Email Discovery & Validation ───
    const emailCandidates = await step.run("discover-emails", async () => {
      return await discoverEmails(rankedCandidates, payload.company);
    });

    if (!emailCandidates.length) {
      return { status: "failed", reason: "no_email_permutations_generated" };
    }

    const validResult = await step.run("validate-emails", async () => {
      return await findFirstValidEmail(emailCandidates);
    });

    if (!validResult) {
      return {
        status: "failed",
        reason: "no_valid_email_found",
        tried: emailCandidates.length,
      };
    }

    // ─── Phase 4: Personalize & Send ───
    const reason = await step.run("personalize", async () => {
      return await personalizeReason(
        payload.company,
        payload.job_title,
        payload.jd,
        payload.company_reason,
        payload.my_summary
      );
    });

    const result = await step.run("send-email", async () => {
      const userId = await getDefaultUserId();
      const profile = await prisma.profileContext.findUnique({ where: { userId } });
      
      const html = composeEmail(
        validResult.candidate.candidate_name,
        reason,
        payload.company,
        payload.job_title,
        validResult.candidate.profile_url ?? undefined,
        profile || undefined
      );
      return await sendOutboundEmail({
        to_email: validResult.candidate.email,
        to_name: validResult.candidate.candidate_name,
        subject: `Application: ${payload.job_title} — ${payload.company}`,
        html_body: html,
        company: payload.company,
        job_title: payload.job_title,
        profile_url: validResult.candidate.profile_url ?? undefined,
      }, userId);
    });

    return {
      status: "sent",
      email: validResult.candidate.email,
      candidate: validResult.candidate.candidate_name,
      profile: validResult.candidate.profile_url,
      confidence: validResult.validation.confidence,
      recruiting_score: validResult.validation.recruiting_score,
      messageId: result.messageId,
    };
  }
);
