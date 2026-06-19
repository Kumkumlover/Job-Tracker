"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  useApplications,
  useCreateApplication,
  useUpdateApplication,
  useDeleteApplication,
} from "@/hooks/useApplications";
import { useCustomProperties, useCustomStages } from "@/hooks/useCustomProperties";
import FilterBar from "@/components/dashboard/FilterBar";
import ViewToggle from "@/components/dashboard/ViewToggle";
import TableView from "@/components/dashboard/TableView";
import KanbanBoard from "@/components/dashboard/KanbanBoard";
import ApplicationForm from "@/components/dashboard/ApplicationForm";
import FollowUpSummary from "@/components/dashboard/FollowUpSummary";
import GmailSyncButton from "@/components/gmail/GmailSyncButton";
import type { ApplicationWithRelations } from "@/types";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [view, setView] = useState<"table" | "kanban">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dashboard-view") as "table" | "kanban") || "table";
    }
    return "table";
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [sortBy, setSortBy] = useState("dateApplied");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<ApplicationWithRelations | null>(null);

  const { data: applications = [], isLoading } = useApplications({
    search,
    status: statusFilter,
    platform: platformFilter,
    sortBy,
    sortOrder,
  });

  const { data: stages = [] } = useCustomStages();
  const { data: customProperties = [] } = useCustomProperties();
  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication();
  const deleteMutation = useDeleteApplication();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signin");
  }, [status, router]);

  const handleViewChange = useCallback((v: "table" | "kanban") => {
    setView(v);
    localStorage.setItem("dashboard-view", v);
  }, []);

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("desc");
      }
    },
    [sortBy]
  );

  const handleSave = async (data: Record<string, unknown>) => {
    if (editingApp) {
      await updateMutation.mutateAsync({ id: editingApp.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
    setShowForm(false);
    setEditingApp(null);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    updateMutation.mutate({ id, data: { status: newStatus } });
  };

  const handleEdit = (app: ApplicationWithRelations) => {
    setEditingApp(app);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg text-[var(--primary)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold">Job Tracker</h1>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <a href="/dashboard" className="text-[var(--primary)]">Dashboard</a>
              <a href="/outreach" className="text-[var(--muted-foreground)] hover:text-white transition-colors">JobSuite (Outreach)</a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <GmailSyncButton />
            <button
              onClick={() => router.push("/settings")}
              className="p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-[var(--border)]">
              <span className="text-sm text-[var(--muted-foreground)]">
                {session?.user?.name || session?.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        <FollowUpSummary applications={applications} />

        <div className="flex items-center justify-between gap-4">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            platformFilter={platformFilter}
            onPlatformChange={setPlatformFilter}
            stages={stages}
            onNewApplication={() => {
              setEditingApp(null);
              setShowForm(true);
            }}
          />
          <ViewToggle view={view} onViewChange={handleViewChange} />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-[var(--secondary)] animate-pulse"
              />
            ))}
          </div>
        ) : view === "table" ? (
          <TableView
            applications={applications}
            stages={stages}
            customProperties={customProperties}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        ) : (
          <KanbanBoard
            applications={applications}
            stages={stages}
            onStatusChange={handleStatusChange}
            onEdit={handleEdit}
          />
        )}

        <div className="text-xs text-[var(--muted-foreground)] text-center pt-4">
          {applications.length} application{applications.length !== 1 ? "s" : ""} total
        </div>
      </main>

      {/* Application Form Modal */}
      {showForm && (
        <ApplicationForm
          application={editingApp}
          stages={stages}
          customProperties={customProperties}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingApp(null);
          }}
        />
      )}
    </div>
  );
}
