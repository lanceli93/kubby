"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Film, Folder, Users, Server, Settings, LogOut, X, UserCircle } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

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

  const navItems = [
    { href: "/", label: tNav("home"), icon: Home },
  ];

  const mediaItems = [
    { href: "/movies", label: tNav("allMovies"), icon: Film, matchPrefix: true },
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
      // System: active on /dashboard, /dashboard/scraper, /dashboard/networking
      // but NOT on /dashboard/libraries or /dashboard/users
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/scraper") || pathname.startsWith("/dashboard/networking");
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
          {/* Home */}
          <div className="flex flex-col gap-0.5">
            {navItems.map(renderItem)}
          </div>

          {/* Media */}
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("media")}
            </p>
            {mediaItems.map(renderItem)}
          </div>

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
