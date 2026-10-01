"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Film,
  Folder,
  Users,
  HardDrive,
  RefreshCw,
  Plus,
  UserPlus,
  UserX,
  Database,
  Trash2,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassToast } from "@/components/ui/glass-toast";
import { useAllScans, useScanActions } from "@/providers/scan-provider";

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

// Structured feed row from /api/dashboard/activity — the message is built here
// from i18n keys so it follows the UI locale.
interface Activity {
  id: string;
  kind:
    | "libraryCreated"
    | "libraryScanned"
    | "moviesAdded"
    | "tvShowsAdded"
    | "photosAdded"
    | "albumsAdded"
    | "userCreated";
  name: string | null;
  library: string | null;
  count: number;
  timestamp: string;
}

// GET /api/setup/demo. Account fields are only present for admin sessions.
interface DemoStatus {
  hasDemo: boolean;
  hasDemoUser?: boolean;
  seededAt?: string | null;
  isCurrentUserDemo?: boolean;
  demoIsLastAdmin?: boolean;
  otherUserCount?: number;
}

interface LibraryRef {
  id: string;
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

// "3 minutes ago" for the last week, then a locale date.
function formatRelative(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diffSec = (ms - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  return new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
  });

  const { data: activityData } = useQuery<Activity[]>({
    queryKey: ["dashboard-activity"],
    queryFn: () => fetch("/api/dashboard/activity").then((r) => r.json()),
  });
  const activities = Array.isArray(activityData) ? activityData : [];

  // Shared with the header "Demo" badge — invalidating it hides both.
  const { data: demoStatus } = useQuery<DemoStatus>({
    queryKey: ["demo-status"],
    queryFn: () => fetch("/api/setup/demo").then((r) => r.json()),
  });

  // Scan All — same per-library fan-out as the Libraries page.
  const { data: libraries = [] } = useQuery<LibraryRef[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });
  const scansMap = useAllScans();
  const { startScan } = useScanActions();
  const anyScanning = libraries.some((lib) => scansMap.get(lib.id)?.scanning);
  const scanAll = () => {
    libraries.forEach((lib) => {
      if (!scansMap.get(lib.id)?.scanning) startScan(lib.id);
    });
  };

  // Demo Data panel state
  const [clearOpen, setClearOpen] = useState(false);
  const [removeAccountOpen, setRemoveAccountOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [removingAccount, setRemovingAccount] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const hasDemo = !!demoStatus?.hasDemo;
  const hasDemoUser = !!demoStatus?.hasDemoUser;
  const isCurrentUserDemo = !!demoStatus?.isCurrentUserDemo;
  const demoIsLastAdmin = !!demoStatus?.demoIsLastAdmin;
  const otherUserCount = demoStatus?.otherUserCount ?? 0;
  const showDemoPanel = hasDemo || hasDemoUser;

  // The header badge links to /dashboard#demo-data; the panel only mounts once
  // the status query resolves, so scroll to it ourselves when it appears.
  useEffect(() => {
    if (showDemoPanel && window.location.hash === "#demo-data") {
      document.getElementById("demo-data")?.scrollIntoView({ block: "start" });
    }
  }, [showDemoPanel]);

  const invalidateAfterDemoChange = () => {
    for (const key of ["demo-status", "libraries", "dashboard-stats", "dashboard-activity", "users"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    router.refresh();
  };

  const handleClearDemo = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/setup/demo?scope=libraries", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setClearOpen(false);
      invalidateAfterDemoChange();
      setToast({ text: t("demoCleared"), success: true });
    } catch {
      setToast({ text: t("demoActionFailed"), success: false });
    } finally {
      setClearing(false);
    }
  };

  const handleRemoveDemoAccount = async () => {
    setRemovingAccount(true);
    try {
      const res = await fetch("/api/setup/demo?scope=account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRemoveAccountOpen(false);
      invalidateAfterDemoChange();
      setToast({ text: t("demoAccountRemoved"), success: true });
    } catch {
      setToast({ text: t("demoActionFailed"), success: false });
    } finally {
      setRemovingAccount(false);
    }
  };

  const handleFactoryReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/setup/demo?scope=all", { method: "DELETE" });
      if (!res.ok) throw new Error();
      const data: { usersRemaining: number; removedCurrentUser: boolean } = await res.json();
      // No accounts left → the app is back at first run. If only our own
      // account went, our session now points at a deleted user → sign out.
      if (data.usersRemaining === 0) {
        await signOut({ callbackUrl: "/setup" });
        return;
      }
      if (data.removedCurrentUser) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      setResetOpen(false);
      invalidateAfterDemoChange();
      setToast({ text: t("factoryResetDone"), success: true });
      setResetting(false);
    } catch {
      setResetting(false);
      setToast({ text: t("demoActionFailed"), success: false });
    }
  };

  const libraryUsage = stats?.libraryUsage ?? [];
  const maxBytes = libraryUsage.length > 0 ? libraryUsage[0].bytes : 0;

  // Per-library item count with the unit that matches the library's domain.
  const itemCountLabel = (type: string, count: number) =>
    t(
      type === "photo"
        ? "itemCountPhotos"
        : type === "music"
          ? "itemCountTracks"
          : type === "tvshow"
            ? "itemCountEpisodes"
            : "itemCountMovies",
      { count },
    );

  const activityMessage = (a: Activity) => {
    const library = a.library ?? "—";
    const name = a.name ?? "";
    switch (a.kind) {
      case "libraryCreated":
        return t("activityLibraryCreated", { library });
      case "libraryScanned":
        return t("activityLibraryScanned", { library });
      case "moviesAdded":
        return a.count === 1 && a.name
          ? t("activityMovieAdded", { name, library })
          : t("activityMoviesAdded", { count: a.count, library });
      case "tvShowsAdded":
        return a.count === 1 && a.name
          ? t("activityTvShowAdded", { name, library })
          : t("activityTvShowsAdded", { count: a.count, library });
      case "photosAdded":
        return a.count === 1 && a.name
          ? t("activityPhotoAdded", { name, library })
          : t("activityPhotosAdded", { count: a.count, library });
      case "albumsAdded":
        return a.count === 1 && a.name
          ? t("activityAlbumAdded", { name, library })
          : t("activityAlbumsAdded", { count: a.count, library });
      case "userCreated":
        return t("activityUserCreated", { name });
    }
  };

  // Shared look for the Demo Data row buttons.
  const rowButton =
    "flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-foreground cursor-pointer transition-fluid hover:bg-white/[0.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.02] disabled:active:scale-100";

  const factoryResetDesc = otherUserCount > 0
    ? t("factoryResetDescKeepUsers", { count: otherUserCount })
    : t("factoryResetDesc");
  const factoryResetConfirmDesc = otherUserCount > 0
    ? t("factoryResetConfirmDescKeepUsers", { count: otherUserCount })
    : t("factoryResetConfirmDesc");

  return (
    <div className="stagger-children flex flex-col gap-8 p-8 px-10">
      {/* Demo Data — first, since it's the most actionable thing when present.
          Shown while demo libraries OR the demo account remain. */}
      {showDemoPanel && (
        <div id="demo-data" className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-amber-300/70" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("demoData")}
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-amber-300/15 to-transparent" />
          </div>
          <div className="flex flex-col gap-5 rounded-xl border border-amber-300/[0.12] bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.15)] transition-fluid">
            <p className="text-sm text-muted-foreground">
              {hasDemo ? t("demoDataDesc") : t("demoDataAccountOnlyDesc")}
            </p>

            {/* Signed in as the shared demo account */}
            {isCurrentUserDemo && (
              <div className="flex gap-3 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-amber-100">{t("demoSignedInTitle")}</span>
                  <span className="text-xs leading-relaxed text-amber-100/70">{t("demoSignedInBody")}</span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href="/dashboard/users"
                      className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-300/20"
                    >
                      {t("demoGoUsers")}
                    </Link>
                    <Link
                      href="/profile"
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.06]"
                    >
                      {t("demoGoProfile")}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Clear demo libraries */}
            {hasDemo && (
              <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-5">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{t("clearDemo")}</span>
                  <span className="text-xs text-muted-foreground">{t("clearDemoDesc")}</span>
                </div>
                <button onClick={() => setClearOpen(true)} className={rowButton}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                  {t("clearDemo")}
                </button>
              </div>
            )}

            {/* Remove demo account */}
            {hasDemoUser && (
              <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-5">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{t("removeDemoAccount")}</span>
                  <span className="text-xs text-muted-foreground">{t("removeDemoAccountDesc")}</span>
                  {(isCurrentUserDemo || demoIsLastAdmin) && (
                    <span className="text-xs text-amber-200/80">
                      {isCurrentUserDemo ? t("removeDemoAccountSelf") : t("removeDemoAccountLastAdmin")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setRemoveAccountOpen(true)}
                  disabled={isCurrentUserDemo || demoIsLastAdmin}
                  className={rowButton}
                >
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  {t("removeDemoAccount")}
                </button>
              </div>
            )}

            {/* Factory reset — demo libraries + demo account */}
            {hasDemoUser && (
              <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-5">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{t("factoryReset")}</span>
                  <span className="text-xs text-muted-foreground">{factoryResetDesc}</span>
                  {demoIsLastAdmin && (
                    <span className="text-xs text-amber-200/80">{t("factoryResetLastAdmin")}</span>
                  )}
                </div>
                <button
                  onClick={() => setResetOpen(true)}
                  disabled={demoIsLastAdmin}
                  className="flex shrink-0 items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive cursor-pointer transition-fluid hover:bg-destructive/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-destructive/10 disabled:active:scale-100"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {t("factoryReset")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
                className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4 last:border-b-0 transition-colors hover:bg-white/[0.02]"
              >
                <p className="min-w-0 truncate text-sm text-foreground">{activityMessage(activity)}</p>
                <time
                  dateTime={activity.timestamp}
                  title={new Date(activity.timestamp).toLocaleString(locale)}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {formatRelative(activity.timestamp, locale)}
                </time>
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
          <button
            onClick={scanAll}
            disabled={anyScanning || libraries.length === 0}
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground cursor-pointer transition-fluid active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${anyScanning ? "animate-spin" : ""}`} />
            {anyScanning ? t("scanningAll") : t("scanAllLibraries")}
          </button>
          <Link
            href="/dashboard/libraries?add=1"
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground cursor-pointer transition-fluid active:scale-95"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            {t("addLibrary")}
          </Link>
          <Link
            href="/dashboard/users?add=1"
            className="card-hover flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm text-foreground cursor-pointer transition-fluid active:scale-95"
          >
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            {t("addUser")}
          </Link>
        </div>
      </div>

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

      {/* Remove demo account confirmation */}
      <Dialog open={removeAccountOpen} onOpenChange={setRemoveAccountOpen}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("removeDemoAccountConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("removeDemoAccountConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRemoveAccountOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={handleRemoveDemoAccount}
              disabled={removingAccount}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {removingAccount ? t("removingDemoAccount") : t("removeDemoAccount")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Factory reset confirmation */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("factoryResetConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {factoryResetConfirmDesc}
              {isCurrentUserDemo && otherUserCount > 0 && <> {t("factoryResetSignOutNote")}</>}
            </DialogDescription>
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
