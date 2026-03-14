"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Folder, Users, Wand2, Globe } from "lucide-react";
import { useTranslations } from "next-intl";

export function AdminSidebar() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  const sidebarItems = [
    { label: t("overview"), href: "/dashboard", icon: LayoutDashboard },
    { label: t("mediaLibraries"), href: "/dashboard/libraries", icon: Folder },
    { label: t("users"), href: "/dashboard/users", icon: Users },
    { label: t("scraperSettings"), href: "/dashboard/scraper", icon: Wand2 },
    { label: t("networking"), href: "/dashboard/networking", icon: Globe },
  ];

  return (
    <>
      <aside className="hidden md:flex w-60 flex-col gap-1 border-r border-white/[0.06] bg-black/30 backdrop-blur-xl py-6">
        <span className="mb-2 px-5 text-[11px] font-semibold uppercase tracking-wider text-[#555568]">
          {t("administration")}
        </span>
        <div className="mx-3 mb-2 h-px bg-gradient-to-r from-white/[0.06] via-white/[0.03] to-transparent" />
        {sidebarItems.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative mx-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-primary/[0.12] to-transparent font-medium text-foreground"
                  : "font-normal text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Icon
                className={`h-[18px] w-[18px] transition-colors ${
                  isActive ? "text-primary" : "text-[#666680] group-hover:text-muted-foreground"
                }`}
              />
              {item.label}
            </Link>
          );
        })}
      </aside>
      {/* Mobile horizontal nav */}
      <nav className="flex md:hidden overflow-x-auto border-b border-white/[0.06] bg-black/30 backdrop-blur-xl px-2 py-2 gap-1">
        {sidebarItems.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/[0.12] font-medium text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-[#666680]"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
