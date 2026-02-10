"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useSession } from "next-auth/react";

export function AppHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Movies", href: "/movies" },
    ...(session?.user?.isAdmin
      ? [{ label: "Dashboard", href: "/dashboard" }]
      : []),
  ];

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-white/[0.08] bg-[var(--header)] px-8">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-[22px] font-bold text-foreground">
          Kubby
        </Link>
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm ${
                  isActive
                    ? "font-semibold text-foreground"
                    : "font-normal text-muted-foreground hover:text-foreground"
                } transition-colors`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/search" className="text-muted-foreground hover:text-foreground transition-colors">
          <Search className="h-5 w-5" />
        </Link>
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
