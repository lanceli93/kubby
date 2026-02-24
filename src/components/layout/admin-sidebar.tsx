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
    <aside className="flex w-60 flex-col gap-1 border-r border-white/[0.06] bg-black/30 backdrop-blur-xl py-6">
      <span className="px-5 text-[11px] font-semibold uppercase tracking-wider text-[#555568]">
        {t("administration")}
      </span>
      {sidebarItems.map((item) => {
        const isActive = item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-10 items-center gap-2.5 px-5 text-sm transition-colors ${
              isActive
                ? "border-l-[3px] border-primary bg-primary/[0.08] font-medium text-foreground"
                : "border-l-[3px] border-transparent font-normal text-muted-foreground hover:bg-white/[0.02] hover:text-foreground"
            }`}
          >
            <Icon
              className={`h-[18px] w-[18px] ${
                isActive ? "text-primary" : "text-[#666680]"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
