"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Folder, Users, HardDrive, RefreshCw, Plus, UserPlus, Database, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassToast } from "@/components/ui/glass-toast";

interface LibraryUsage {
  libraryId: string;
  libraryName: string;
  type: string;
  bytes: number;
  formatted: string;
  itemCount: number;
}

interface DashboardStats {
  totalItems: number;
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

interface DemoStatus {
  hasDemo: boolean;
  seededAt: string | null;
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
    <div className="card-hover flex flex-1 flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.15)] transition-fluid">
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
  "bg-indigo-400",
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
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["dashboard-activity"],
    queryFn: () => fetch("/api/dashboard/activity").then((r) => r.json()),
  });

  const { data: demoStatus } = useQuery<DemoStatus>({
    queryKey: ["demo-status"],
    queryFn: () => fetch("/api/setup/demo").then((r) => r.json()),
  });

  // Demo Data panel state
  const [clearOpen, setClearOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleClearDemo = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/setup/demo", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setClearOpen(false);
      queryClient.invalidateQueries({ queryKey: ["demo-status"] });
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      router.refresh();
      setToast({ text: t("clearDemo"), success: true });
    } catch {
      setToast({ text: t("clearDemo"), success: false });
    } finally {
      setClearing(false);
    }
  };

  const handleFactoryReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/setup/demo?factoryReset=true", { method: "DELETE" });
      if (!res.ok) throw new Error();
      window.location.href = "/setup";
    } catch {
      setResetting(false);
      setToast({ text: t("factoryReset"), success: false });
    }
  };

  const libraryUsage = stats?.libraryUsage ?? [];
  const maxBytes = libraryUsage.length > 0 ? libraryUsage[0].bytes : 0;

  // Per-library item count with the unit that matches the library's domain.
  const itemCountLabel = (type: string, count: number) =>
    t(type === "photo" ? "itemCountPhotos" : type === "music" ? "itemCountTracks" : "itemCountMovies", { count });

  return (
    <div className="stagger-children flex flex-col gap-8 p-8 px-10">
      {/* Stats */}
      <div className="flex gap-4">
        <StatCard
          label={t("totalItems")}
          value={stats?.totalItems ?? 0}
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
                          {itemCountLabel(lib.type, lib.itemCount)}
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
          <button className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground cursor-pointer transition-fluid active:scale-95">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            {t("scanAllLibraries")}
          </button>
          <Link
            href="/dashboard/libraries"
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground cursor-pointer transition-fluid active:scale-95"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            {t("addLibrary")}
          </Link>
          <Link
            href="/dashboard/users"
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground cursor-pointer transition-fluid active:scale-95"
          >
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            {t("addUser")}
          </Link>
        </div>
      </div>

      {/* Demo Data */}
      {demoStatus?.hasDemo && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-muted-foreground/60" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("demoData")}
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
          </div>
          <div className="card-hover flex flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.15)] transition-fluid">
            <p className="text-sm text-muted-foreground">{t("demoDataDesc")}</p>

            {/* Clear demo libraries */}
            <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-5">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{t("clearDemo")}</span>
                <span className="text-xs text-muted-foreground">{t("clearDemoDesc")}</span>
              </div>
              <button
                onClick={() => setClearOpen(true)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-foreground cursor-pointer transition-fluid hover:bg-white/[0.04] active:scale-95"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                {t("clearDemo")}
              </button>
            </div>

            {/* Factory reset */}
            <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-5">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{t("factoryReset")}</span>
                <span className="text-xs text-muted-foreground">{t("factoryResetDesc")}</span>
              </div>
              <button
                onClick={() => setResetOpen(true)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive cursor-pointer transition-fluid hover:bg-destructive/20 active:scale-95"
              >
                <AlertTriangle className="h-4 w-4" />
                {t("factoryReset")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear demo libraries confirmation */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("clearDemoConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("clearDemoConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setClearOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={handleClearDemo}
              disabled={clearing}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {clearing ? t("clearingDemo") : t("clearDemo")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Factory reset confirmation */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("factoryResetConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("factoryResetConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={handleFactoryReset}
              disabled={resetting}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {resetting ? t("clearingDemo") : t("factoryReset")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GlassToast visible={!!toast} success={toast?.success}>
        {toast?.text}
      </GlassToast>
    </div>
  );
}
