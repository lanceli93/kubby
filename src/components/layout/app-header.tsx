"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Search, ArrowLeft, House, Menu, User, ChevronDown, Check, Clapperboard, Images } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { NavSidebar } from "@/components/layout/nav-sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useHasPhotoLibrary } from "@/hooks/use-has-photo-library";

function KubbyLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Rounded square frame */}
      <rect x="2" y="2" width="24" height="24" rx="6" stroke="#6366f1" strokeWidth="2.2" />
      {/* Letter K */}
      <path
        d="M10 8v12M10 14l8-6M10 14l8 6"
        stroke="#6366f1"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Library {
  id: string;
  name: string;
}

export function AppHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const tNav = useTranslations("nav");
  const hasPhotoLibrary = useHasPhotoLibrary();
  const isPhotoDomain = pathname.startsWith("/photos");

  const isLibraryPage = pathname === "/movies" && searchParams.get("libraryId");
  const isPersonFilmography = pathname === "/movies" && searchParams.get("personId");
  const isMovieDetail = /^\/movies\/[^/]+$/.test(pathname);
  const isPersonDetail = /^\/people\/[^/]+$/.test(pathname);
  const isPlayerPage = /^\/movies\/[^/]+\/play$/.test(pathname);
  const isSearchPage = pathname === "/search";
  const isProfilePage = pathname === "/profile";
  const isPreferencesPage = pathname.startsWith("/preferences");
  const needsBackNav = isMovieDetail || isPersonDetail || isSearchPage || isProfilePage || isPreferencesPage;
  const libraryId = searchParams.get("libraryId");
  const personId = searchParams.get("personId");
  const filterGenre = searchParams.get("genre");
  const filterTag = searchParams.get("tag");
  const filterStudio = searchParams.get("studio");
  const filterLabel = filterGenre || filterTag || filterStudio;

  const { data: library } = useQuery<Library>({
    queryKey: ["library", libraryId],
    queryFn: () => fetch(`/api/libraries/${libraryId}`).then((r) => r.json()),
    enabled: !!isLibraryPage && !!libraryId,
  });

  const { data: personData } = useQuery<{ name: string }>({
    queryKey: ["person-header", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
    enabled: !!isPersonFilmography && !!personId,
  });

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  if (isPlayerPage) return null;

  const isTransparent = isMovieDetail || isPersonDetail || pathname === "/";

  return (
    <header
      className={`flex h-12 w-full items-center justify-between px-3 md:px-8 ${
        isTransparent
          ? "pointer-events-none absolute top-0 left-0 z-30 bg-transparent"
          : "bg-[var(--header)]"
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-4">
        <button
          onClick={() => setSidebarOpen(true)}
          className={`transition-colors ${
            isTransparent
              ? "text-white/80 hover:text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Menu className="h-5 w-5" />
        </button>
        {isLibraryPage || isPersonFilmography ? (
          <>
            <Link
              href={isPersonFilmography ? `/people/${personId}` : "/"}
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
              {isPersonFilmography
                ? personData?.name || ""
                : `${library?.name || ""}${filterLabel ? ` — ${filterLabel}` : ""}`}
            </span>
          </>
        ) : needsBackNav ? (
          <>
            <button
              onClick={() => router.back()}
              className={`transition-colors ${
                isTransparent
                  ? "text-white/80 hover:text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Link
              href="/"
              className={`transition-colors ${
                isTransparent
                  ? "text-white/80 hover:text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <House className="h-5 w-5" />
            </Link>
          </>
        ) : (
          <>
            {hasPhotoLibrary ? (
              // Domain switcher lives on the brand as a low-frequency dropdown,
              // so the header keeps a single row of primary navigation instead
              // of two competing pill groups (see the home Tabs island).
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`flex items-center gap-1.5 rounded-lg px-1 text-[22px] font-bold outline-none transition-colors ${
                    isTransparent
                      ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                      : "text-foreground"
                  }`}
                >
                  <KubbyLogo className="h-7 w-7" />
                  Kubby
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isTransparent ? "text-white/70" : "text-muted-foreground"
                    }`}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-44 border-white/10 bg-black/70 backdrop-blur-xl"
                >
                  <DropdownMenuItem asChild>
                    <Link href="/" className="cursor-pointer">
                      <Clapperboard className="h-4 w-4" />
                      <span className="flex-1">{tNav("cinema")}</span>
                      {!isPhotoDomain && <Check className="h-4 w-4 text-primary" />}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/photos" className="cursor-pointer">
                      <Images className="h-4 w-4" />
                      <span className="flex-1">{tNav("photos")}</span>
                      {isPhotoDomain && <Check className="h-4 w-4 text-primary" />}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/" className="flex items-center gap-2 text-[22px] font-bold text-foreground">
                <KubbyLogo className="h-7 w-7" />
                Kubby
              </Link>
            )}
          </>
        )}
      </div>
      <div className="pointer-events-auto flex items-center gap-4">
        <Link
          href="/search"
          onClick={(e) => {
            if (pathname === "/search") {
              e.preventDefault();
              const el = document.getElementById("search-scroll-container");
              if (el) el.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          className={`transition-colors ${
            isTransparent
              ? "text-white/80 hover:text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="h-5 w-5" />
        </Link>
        <Link
          href="/profile"
          className={`transition-colors ${
            isTransparent
              ? "text-white/80 hover:text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="h-5 w-5" />
        </Link>
      </div>
      {/* NavSidebar renders fixed overlays; wrap so they still receive pointer
          events when the header itself is pointer-events-none (transparent `/`).
          `absolute` keeps the zero-size wrapper out of the flex flow — as a
          third flex item it would push the icon group into the center. */}
      <div className="pointer-events-auto absolute">
        <NavSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>
    </header>
  );
}
