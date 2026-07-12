"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Users, Server, Settings, LogOut, X, UserCircle, Wand2, LayoutGrid, Images, Music, Tv, Clapperboard, Check } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCurrentDomain, type MediaDomain } from "@/hooks/use-current-domain";
import { useHasPhotoLibrary } from "@/hooks/use-has-photo-library";
import { useHasMusicLibrary } from "@/hooks/use-has-music-library";
import { useHasTvLibrary } from "@/hooks/use-has-tv-library";

interface NavSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function NavSidebar({ open, onClose }: NavSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean })?.isAdmin;
  const tNav = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const domain = useCurrentDomain();
  const hasTvLibrary = useHasTvLibrary();
  const hasPhotoLibrary = useHasPhotoLibrary();
  const hasMusicLibrary = useHasMusicLibrary();

  // Close on ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, onClose]);

  // Domain group — the sidebar's answer to "which domain am I in, and how do I
  // switch?". Replaces the old cinema-only Home item + the redundant single-entry
  // Media group. Cinema is always present; the other domains appear only when a
  // library of that type exists (same shared-cache hooks the header brand
  // dropdown uses). Order mirrors the header: Cinema → TV → Photos → Music.
  const domainItems: {
    domain: MediaDomain;
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { domain: "cinema", href: "/", label: tNav("cinema"), icon: Clapperboard },
    ...(hasTvLibrary
      ? [{ domain: "tv" as const, href: "/tv", label: tNav("tv"), icon: Tv }]
      : []),
    ...(hasPhotoLibrary
      ? [{ domain: "photos" as const, href: "/photos", label: tNav("photos"), icon: Images }]
      : []),
    ...(hasMusicLibrary
      ? [{ domain: "music" as const, href: "/music", label: tNav("music"), icon: Music }]
      : []),
  ];

  const metadataItems = [
    { href: "/metadata/scraper", label: tNav("providers"), icon: Wand2 },
    { href: "/metadata/browse", label: tNav("browse"), icon: LayoutGrid },
  ];

  const adminItems = [
    { href: "/dashboard/libraries", label: tNav("libraries"), icon: Folder },
    { href: "/dashboard/users", label: tNav("users"), icon: Users },
    { href: "/dashboard", label: tNav("system"), icon: Server, matchSystem: true },
  ];

  const userItems = [
    { href: "/preferences", label: tNav("preferences"), icon: Settings, matchPrefix: true },
    { href: "/profile", label: tNav("profile"), icon: UserCircle },
  ];

  const isActive = (href: string, matchPrefix?: boolean, matchSystem?: boolean) => {
    if (matchSystem) {
      // System: active on /dashboard and /dashboard/networking
      // but NOT on /dashboard/libraries or /dashboard/users
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/networking");
    }
    if (matchPrefix) return pathname.startsWith(href);
    return pathname === href || pathname.startsWith(href + "/");
  };

  const renderItem = (item: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; matchPrefix?: boolean; matchSystem?: boolean }) => {
    const Icon = item.icon;
    const active = isActive(item.href, item.matchPrefix, item.matchSystem);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-fluid cursor-pointer ${
          active
            ? "bg-white/[0.08] text-primary ring-1 ring-white/[0.06]"
            : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-[#0a0a0f]/70 backdrop-blur-2xl border-r border-white/[0.08] shadow-[inset_-0.5px_0_0_rgba(255,255,255,0.06)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <div className="flex h-12 items-center justify-end px-4">
          <button
            onClick={onClose}
            className="glass-btn rounded-lg p-1.5 cursor-pointer transition-fluid"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
          {/* Domains — current domain highlighted (with a check), tap another to
              switch. Only shown as a group when >1 domain exists; a single-domain
              install still renders the lone Cinema row so the label reads clearly. */}
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("media")}
            </p>
            {domainItems.map((item) => {
              const Icon = item.icon;
              const active = domain === item.domain;
              return (
                <Link
                  key={item.domain}
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-fluid cursor-pointer ${
                    active
                      ? "bg-white/[0.08] text-primary ring-1 ring-white/[0.06]"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </Link>
              );
            })}
          </div>

          {/* Metadata (admin only, cinema domain only) */}
          {isAdmin && domain === "cinema" && (
            <div className="flex flex-col gap-0.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {tNav("metadata")}
              </p>
              {metadataItems.map(renderItem)}
            </div>
          )}

          {/* Admin (admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-0.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {tNav("admin")}
              </p>
              {adminItems.map(renderItem)}
            </div>
          )}

          {/* User */}
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("user")}
            </p>
            {userItems.map(renderItem)}
            <button
              onClick={() => {
                onClose();
                signOut({ callbackUrl: "/login" });
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-fluid cursor-pointer hover:bg-white/[0.06] hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              {tAuth("signOut")}
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}
