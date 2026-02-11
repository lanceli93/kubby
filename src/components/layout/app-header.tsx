"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, ArrowLeft, House } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

interface Library {
  id: string;
  name: string;
}

export function AppHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const isLibraryPage = pathname === "/movies" && searchParams.get("libraryId");
  const isMovieDetail = /^\/movies\/[^/]+$/.test(pathname);
  const libraryId = searchParams.get("libraryId");

  const { data: library } = useQuery<Library>({
    queryKey: ["library", libraryId],
    queryFn: () => fetch(`/api/libraries/${libraryId}`).then((r) => r.json()),
    enabled: !!isLibraryPage && !!libraryId,
  });

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <header
      className={`flex h-16 w-full items-center justify-between px-8 ${
        isMovieDetail
          ? "absolute top-0 left-0 z-30 bg-transparent"
          : "bg-[var(--header)]"
      }`}
    >
      <div className="flex items-center gap-4">
        {isLibraryPage ? (
          <>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <House className="h-5 w-5" />
            </Link>
            <span className="text-xl font-semibold text-foreground">
              {library?.name || ""}
            </span>
          </>
        ) : (
          <Link href="/" className="text-[22px] font-bold text-foreground">
            Kubby
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/search"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
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
