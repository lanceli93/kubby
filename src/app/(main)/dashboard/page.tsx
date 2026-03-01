"use client";

import { useQuery } from "@tanstack/react-query";
import { Film, Folder, Users, HardDrive, RefreshCw, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface LibraryUsage {
  libraryId: string;
  libraryName: string;
  bytes: number;
  formatted: string;
  movieCount: number;
}

interface DashboardStats {
  totalMovies: number;
  totalLibraries: number;
  totalUsers: number;
  diskUsage: string;
  diskUsageBytes: number;
  libraryUsage: LibraryUsage[];
}

interface Activity {
  id: string;
  message: string;
  timestamp: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="card-hover flex flex-1 flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.15)]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-muted-foreground/40" />
      </div>
      <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// Consistent color palette for library bars
const BAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
];

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["dashboard-activity"],
    queryFn: () => fetch("/api/dashboard/activity").then((r) => r.json()),
  });

  const libraryUsage = stats?.libraryUsage ?? [];
  const maxBytes = libraryUsage.length > 0 ? libraryUsage[0].bytes : 0;

  return (
    <div className="stagger-children flex flex-col gap-8 p-8 px-10">
      {/* Stats */}
      <div className="flex gap-4">
        <StatCard
          label={t("totalMovies")}
          value={stats?.totalMovies ?? 0}
          icon={Film}
        />
        <StatCard
          label={t("mediaLibraries")}
          value={stats?.totalLibraries ?? 0}
          icon={Folder}
        />
        <StatCard
          label={t("users")}
          value={stats?.totalUsers ?? 0}
          icon={Users}
        />
        <StatCard
          label={t("diskUsage")}
          value={stats?.diskUsage ?? "—"}
          icon={HardDrive}
        />
      </div>

      {/* Disk Usage per Library */}
      {libraryUsage.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <HardDrive className="h-4 w-4 text-muted-foreground/60" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("diskUsage")}
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/50 p-6">
            <div className="flex flex-col gap-4">
              {libraryUsage.map((lib, i) => {
                const pct = maxBytes > 0 ? (lib.bytes / maxBytes) * 100 : 0;
                return (
                  <div key={lib.libraryId} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-muted-foreground/60" />
                        <span className="font-medium text-foreground">{lib.libraryName}</span>
                        <span className="text-xs text-muted-foreground">
                          {lib.movieCount} {lib.movieCount === 1 ? "movie" : "movies"}
                        </span>
                      </div>
                      <span className="font-mono text-sm text-muted-foreground">{lib.formatted}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className={`h-full rounded-full transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
                        style={{ width: `${Math.max(pct, 0.5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-muted-foreground/60" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("recentActivity")}
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/50">
          {activities.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("noRecentActivity")}
            </p>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 last:border-b-0 transition-colors hover:bg-white/[0.02]"
              >
                <p className="text-sm text-foreground">{activity.message}</p>
                <span className="text-xs text-muted-foreground">
                  {activity.timestamp}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Plus className="h-4 w-4 text-muted-foreground/60" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("quickActions")}
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
        </div>
        <div className="flex gap-3">
          <button className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            {t("scanAllLibraries")}
          </button>
          <Link
            href="/dashboard/libraries"
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            {t("addLibrary")}
          </Link>
          <Link
            href="/dashboard/users"
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground"
          >
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            {t("addUser")}
          </Link>
        </div>
      </div>
    </div>
  );
}
