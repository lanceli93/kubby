"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Film, LayoutDashboard, Database, Settings, LogOut, X, SlidersHorizontal, BadgeCheck } from "lucide-react";
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
    { href: "/personal-metadata", label: tNav("personalMetadata"), icon: SlidersHorizontal },
    { href: "/card-badges", label: tNav("cardBadges"), icon: BadgeCheck },
  ];

  const adminItems = [
    { href: "/dashboard", label: tNav("dashboard"), icon: LayoutDashboard },
    { href: "#", label: tNav("metadataManager"), icon: Database, placeholder: true },
  ];

  const userItems = [
    { href: "/settings", label: tNav("settings"), icon: Settings },
  ];

  const isActive = (href: string, matchPrefix?: boolean) => {
    if (matchPrefix) return pathname.startsWith(href);
    return pathname === href;
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
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-[var(--header)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <div className="flex h-12 items-center justify-end px-4">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
          {/* Home */}
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Media */}
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("media")}
            </p>
            {mediaItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.matchPrefix);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Administration (admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-0.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {tNav("administration")}
              </p>
              {adminItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={(e) => {
                      if (item.placeholder) {
                        e.preventDefault();
                        alert("Metadata Manager — coming soon");
                      }
                      onClose();
                    }}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* User */}
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("user")}
            </p>
            {userItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => {
                onClose();
                signOut();
              }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
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
