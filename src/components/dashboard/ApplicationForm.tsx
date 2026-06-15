"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { PLATFORMS, PLATFORM_LABELS, LOCATION_TYPES } from "@/lib/constants";
import type { ApplicationWithRelations } from "@/types";
import type { CustomProperty, CustomStage } from "@prisma/client";

interface ApplicationFormProps {
  application?: ApplicationWithRelations | null;
  stages: CustomStage[];
  customProperties: CustomProperty[];
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function ApplicationForm({
  application,
  stages,
  customProperties,
  onSave,
  onClose,
}: ApplicationFormProps) {
  const [form, setForm] = useState({
    company: "",
    role: "",
    platform: "manual",
    status: "applied",
    dateApplied: new Date().toISOString().split("T")[0],
    followUpDate: "",
    jobUrl: "",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "INR",
    location: "",
    locationType: "",
    notes: "",
    linkedinDmSent: false,
    jobDescription: "",
  });

  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (application) {
      setForm({
        company: application.company,
        role: application.role,
        platform: application.platform,
        status: application.status,
        dateApplied: new Date(application.dateApplied)
          .toISOString()
          .split("T")[0],
        followUpDate: application.followUpDate
          ? new Date(application.followUpDate).toISOString().split("T")[0]
          : "",
        jobUrl: application.jobUrl || "",
        salaryMin: application.salaryMin?.toString() || "",
        salaryMax: application.salaryMax || "",
        salaryCurrency: application.salaryCurrency || "INR",
        location: application.location || "",
        locationType: application.locationType || "",
        notes: application.notes || "",
        linkedinDmSent: application.linkedinDmSent,
        jobDescription: application.jobDescription || "",
      });

      const cvMap: Record<string, string> = {};
      application.customValues.forEach((cv) => {
        cvMap[cv.customPropertyId] = cv.value;
      });
      setCustomValues(cvMap);
    }
  }, [application]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      ...form,
      salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
      salaryMax: form.salaryMax || null,
      followUpDate: form.followUpDate || null,
      customValues: Object.keys(customValues).length > 0 ? customValues : undefined,
    };
    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">
            {application ? "Edit Application" : "New Application"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Company & Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Company *
              </label>
              <input
                required
                value={form.company}
                onChange={(e) =>
                  setForm({ ...form, company: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role *</label>
              <input
                required
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
          </div>

          {/* Platform, Status, Date */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Platform
              </label>
              <select
                value={form.platform}
                onChange={(e) =>
                  setForm({ ...form, platform: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Date Applied
              </label>
              <input
                type="date"
                value={form.dateApplied}
                onChange={(e) =>
                  setForm({ ...form, dateApplied: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              />
            </div>
          </div>

          {/* Follow Up & Job URL */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Follow-up Date
              </label>
              <input
                type="date"
                value={form.followUpDate}
                onChange={(e) =>
                  setForm({ ...form, followUpDate: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Job URL</label>
              <input
                type="url"
                value={form.jobUrl}
                onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Location
              </label>
              <input
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                placeholder="e.g. Bangalore, India"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Location Type
              </label>
              <select
                value={form.locationType}
                onChange={(e) =>
                  setForm({ ...form, locationType: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              >
                <option value="">—</option>
                {LOCATION_TYPES.map((lt) => (
                  <option key={lt} value={lt}>
                    {lt.charAt(0).toUpperCase() + lt.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Salary */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Salary Min
              </label>
              <input
                type="number"
                value={form.salaryMin}
                onChange={(e) =>
                  setForm({ ...form, salaryMin: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Salary Max
              </label>
              <input
                value={form.salaryMax}
                onChange={(e) =>
                  setForm({ ...form, salaryMax: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                placeholder="e.g. 25 LPA or negotiable"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Currency
              </label>
              <select
                value={form.salaryCurrency}
                onChange={(e) =>
                  setForm({ ...form, salaryCurrency: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* LinkedIn DM */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="linkedinDm"
              checked={form.linkedinDmSent}
              onChange={(e) =>
                setForm({ ...form, linkedinDmSent: e.target.checked })
              }
              className="rounded"
            />
            <label htmlFor="linkedinDm" className="text-sm">
              LinkedIn DM sent
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-y"
            />
          </div>

          {/* Custom Properties */}
          {customProperties.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 text-[var(--muted-foreground)]">
                Custom Fields
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {customProperties.map((cp) => (
                  <div key={cp.id}>
                    <label className="block text-sm font-medium mb-1">
                      {cp.name}
                    </label>
                    {cp.type === "select" ? (
                      <select
                        value={customValues[cp.id] || ""}
                        onChange={(e) =>
                          setCustomValues({
                            ...customValues,
                            [cp.id]: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                      >
                        <option value="">—</option>
                        {(cp.options as string[] | null)?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : cp.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={customValues[cp.id] === "true"}
                        onChange={(e) =>
                          setCustomValues({
                            ...customValues,
                            [cp.id]: e.target.checked.toString(),
                          })
                        }
                        className="rounded"
                      />
                    ) : (
                      <input
                        type={
                          cp.type === "number"
                            ? "number"
                            : cp.type === "date"
                            ? "date"
                            : cp.type === "url"
                            ? "url"
                            : "text"
                        }
                        value={customValues[cp.id] || ""}
                        onChange={(e) =>
                          setCustomValues({
                            ...customValues,
                            [cp.id]: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-colors"
            >
              {application ? "Save Changes" : "Create Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
