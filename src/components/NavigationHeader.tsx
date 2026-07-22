"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Settings, LogOut, User } from "lucide-react";
import GmailSyncButton from "@/components/gmail/GmailSyncButton";
import Link from "next/link";

export default function NavigationHeader() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // If not authenticated (or loading), we could hide the header or show a minimal one
  if (status === "loading" || status === "unauthenticated") {
    return null;
  }

  const isActive = (path: string) => {
    return pathname === path ? "text-[var(--primary)] font-semibold" : "text-[var(--muted-foreground)] hover:text-white transition-colors";
  };

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-lg font-bold hover:opacity-80 transition-opacity">
            Job Tracker
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className={isActive("/dashboard")}>
              Dashboard
            </Link>
            <Link href="/outreach" className={isActive("/outreach")}>
              JobSuite (Outreach)
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <GmailSyncButton />
          
          <button
            onClick={() => router.push("/profile")}
            className={`p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors ${pathname === "/profile" ? "bg-[var(--secondary)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
            title="Profile"
          >
            <User className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => router.push("/settings")}
            className={`p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors ${pathname === "/settings" ? "bg-[var(--secondary)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2 pl-3 border-l border-[var(--border)]">
            <span className="text-sm text-[var(--muted-foreground)] hidden md:inline-block truncate max-w-[150px]">
              {session?.user?.name || session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-[var(--muted-foreground)]"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
