"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Users, Server, Settings, LogOut, X, UserCircle, Wand2, LayoutGrid } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCurrentDomain } from "@/hooks/use-current-domain";
import { useDomainItems, useDomainSwitch } from "@/hooks/use-domain-items";
import { useNavDrawer } from "@/components/layout/nav-drawer";
import { DomainCard } from "@/components/layout/domain-card";

// Rendered by the (main) layout as a sibling of <PageShell>, never inside it —
// the shell is transformed while the drawer is open (push-back depth effect).
export function NavSidebar() {
  const { open, setOpen } = useNavDrawer();
  const onClose = useCallback(() => setOpen(false), [setOpen]);
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean })?.isAdmin;
  const tNav = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const domain = useCurrentDomain();
  // Domain group — the sidebar's answer to "which domain am I in, and how do I
  // switch?". Cinema is always present; the other domains appear only when a
  // library of that type exists (same list + order as the header brand
  // dropdown). Switching runs the spatial domain View Transition.
  const domainItems = useDomainItems();
  const switchDomain = useDomainSwitch("drawer");

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

  // Panel only — no backdrop of its own: the receded page shell dims itself and
  // catches the click-to-close (see PageShell).
  return (
    <div
      data-open={open}
      className="nav-drawer-panel fixed left-0 top-0 z-50 flex h-full w-64 flex-col"
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
            switch. A single-domain install still renders the lone Cinema card
            so the label reads clearly. */}
        <div className="flex flex-col gap-0.5">
          <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {tNav("media")}
          </p>
          <div className="flex flex-col gap-1">
            {domainItems.map((item) => (
              <DomainCard
                key={item.domain}
                size="drawer"
                {...item}
                onClick={(e) => switchDomain(e, item)}
              />
            ))}
          </div>
        </div>

        {/* Metadata (admin only, cinema domain only) */}
        {isAdmin && domain === "cinema" && (
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("metadata")}
            </p>
            {metadataItems.map(renderItem)}
          </div>
        )}

        {/* Admin (admin only) */}
        {isAdmin && (
          <div className="flex flex-col gap-0.5">
            <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {tNav("admin")}
            </p>
            {adminItems.map(renderItem)}
          </div>
        )}

        {/* User */}
        <div className="flex flex-col gap-0.5">
          <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
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
  );
}
