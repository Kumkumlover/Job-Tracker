"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  ExternalLink,
  MessageSquare,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Briefcase,
} from "lucide-react";
import { useApplication } from "@/hooks/useApplications";
import { useCustomStages } from "@/hooks/useCustomProperties";
import FollowUpBadge from "@/components/dashboard/FollowUpBadge";
import { PLATFORM_LABELS, TOUCHPOINT_LABELS, type Platform } from "@/lib/constants";

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const { data: app, isLoading } = useApplication(params.id as string);
  const { data: stages = [] } = useCustomStages();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signin");
  }, [status, router]);

  if (isLoading || !app) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  const stage = stages.find((s) => s.slug === app.status);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{app.company}</h1>
              <p className="text-lg text-[var(--muted-foreground)]">
                {app.role}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {stage && (
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium text-white"
                  style={{ backgroundColor: stage.color }}
                >
                  {stage.name}
                </span>
              )}
              {app.jobUrl && (
                <a
                  href={app.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Key Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
              <Briefcase className="w-4 h-4" />
              <span className="text-xs uppercase">Platform</span>
            </div>
            <p className="font-medium">
              {PLATFORM_LABELS[app.platform as Platform] || app.platform}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs uppercase">Applied</span>
            </div>
            <p className="font-medium">
              {format(new Date(app.dateApplied), "MMM d, yyyy")}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
              <MapPin className="w-4 h-4" />
              <span className="text-xs uppercase">Location</span>
            </div>
            <p className="font-medium">
              {app.location || "—"}
              {app.locationType && (
                <span className="text-xs text-[var(--muted-foreground)] ml-1">
                  ({app.locationType})
                </span>
              )}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs uppercase">Salary</span>
            </div>
            <p className="font-medium">
              {app.salaryMin || app.salaryMax
                ? `${app.salaryCurrency} ${app.salaryMin || "—"} - ${app.salaryMax || "—"}`
                : "—"}
            </p>
          </div>
        </div>

        {/* Follow Up */}
        {app.followUpDate && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="text-sm font-medium mb-2">Follow Up</h3>
            <div className="flex items-center gap-3">
              <FollowUpBadge date={app.followUpDate.toString()} />
              <span className="text-sm text-[var(--muted-foreground)]">
                {format(new Date(app.followUpDate), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
          </div>
        )}

        {/* Touchpoints & Channels */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h3 className="text-sm font-medium mb-3">Touchpoints & Channels</h3>
          <div className="flex items-center gap-4 mb-3">
            {app.linkedinDmSent && (
              <span className="flex items-center gap-1.5 text-sm text-blue-600">
                <MessageSquare className="w-4 h-4" />
                LinkedIn DM sent
              </span>
            )}
            {app.emailThreadId && (
              <a
                href={`/api/gmail/open?thread=${app.emailThreadId}&app=${app.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-500 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Open email thread
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {app.touchpoints.length > 0 ? (
            <div className="space-y-2">
              {app.touchpoints.map((tp) => {
                const meta = tp.metadata as Record<string, string> | null;
                const emailSubject = meta?.subject;
                const detectedStage = meta?.detectedStage;
                return (
                  <div
                    key={tp.id}
                    className="flex items-start justify-between py-2 border-t border-[var(--border)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {TOUCHPOINT_LABELS[tp.type] || tp.type}
                        </span>
                        {detectedStage && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)]">
                            {detectedStage}
                          </span>
                        )}
                      </div>
                      {emailSubject && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
                          {emailSubject}
                        </p>
                      )}
                      {tp.notes && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                          {tp.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {format(new Date(tp.date), "MMM d, yyyy")}
                      </span>
                      {tp.emailMessageId && (
                        <a href={`/api/gmail/open?tp=${tp.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-400 transition-colors"
                          title="Open in Gmail">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No touchpoints recorded yet.
            </p>
          )}
        </div>

        {/* Custom Values */}
        {app.customValues.length > 0 && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="text-sm font-medium mb-3">Custom Fields</h3>
            <div className="grid grid-cols-2 gap-3">
              {app.customValues.map((cv) => (
                <div key={cv.id}>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {cv.customProperty.name}
                  </span>
                  <p className="text-sm font-medium">{cv.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {app.notes && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="text-sm font-medium mb-2">Notes</h3>
            <p className="text-sm whitespace-pre-wrap">{app.notes}</p>
          </div>
        )}

        {/* Job Description */}
        {app.jobDescription && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="text-sm font-medium mb-2">Job Description</h3>
            <p className="text-sm whitespace-pre-wrap text-[var(--muted-foreground)]">
              {app.jobDescription}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
