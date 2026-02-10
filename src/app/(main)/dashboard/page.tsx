"use client";

import { useQuery } from "@tanstack/react-query";
import { Film, Folder, Users, HardDrive, RefreshCw, Plus, UserPlus } from "lucide-react";
import Link from "next/link";

interface DashboardStats {
  totalMovies: number;
  totalLibraries: number;
  totalUsers: number;
  diskUsage: string;
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
    <div className="flex flex-1 flex-col gap-2 rounded-xl border border-white/[0.03] bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <span className="text-3xl font-bold text-foreground">{value}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["dashboard-activity"],
    queryFn: () => fetch("/api/dashboard/activity").then((r) => r.json()),
  });

  return (
    <div className="flex flex-col gap-8 p-8 px-10">
      {/* Stats */}
      <div className="flex gap-4">
        <StatCard
          label="Total Movies"
          value={stats?.totalMovies ?? 0}
          icon={Film}
        />
        <StatCard
          label="Media Libraries"
          value={stats?.totalLibraries ?? 0}
          icon={Folder}
        />
        <StatCard
          label="Users"
          value={stats?.totalUsers ?? 0}
          icon={Users}
        />
        <StatCard
          label="Disk Usage"
          value={stats?.diskUsage ?? "—"}
          icon={HardDrive}
        />
      </div>

      {/* Recent Activity */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Activity
        </h2>
        <div className="rounded-xl border border-white/[0.03] bg-card">
          {activities.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No recent activity
            </p>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between border-b border-white/[0.03] px-6 py-4 last:border-b-0"
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
        <h2 className="text-lg font-semibold text-foreground">
          Quick Actions
        </h2>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.04]">
            <RefreshCw className="h-4 w-4" />
            Scan All Libraries
          </button>
          <Link
            href="/dashboard/libraries"
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.04]"
          >
            <Plus className="h-4 w-4" />
            Add Library
          </Link>
          <Link
            href="/dashboard/users"
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.04]"
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </Link>
        </div>
      </div>
    </div>
  );
}
