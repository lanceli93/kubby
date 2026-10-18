"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Search, ArrowLeft, House, Menu, User, ChevronDown } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useNavDrawer } from "@/components/layout/nav-drawer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useHasPhotoLibrary } from "@/hooks/use-has-photo-library";
import { useHasMusicLibrary } from "@/hooks/use-has-music-library";
import { useHasTvLibrary } from "@/hooks/use-has-tv-library";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useDomainItems, useDomainSwitch } from "@/hooks/use-domain-items";
import { DomainCard } from "@/components/layout/domain-card";

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
  const { setOpen: setDrawerOpen } = useNavDrawer();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const tNav = useTranslations("nav");
  const hasPhotoLibrary = useHasPhotoLibrary();
  const hasMusicLibrary = useHasMusicLibrary();
  const hasTvLibrary = useHasTvLibrary();
  const isAdmin = useIsAdmin();
  const domainItems = useDomainItems();
  const switchDomain = useDomainSwitch("menu");
  // Controlled so a plain click can close it: the card's onClick prevents
  // default (we navigate through the domain View Transition), which also stops
  // Radix's own select-to-close.
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const isTvDomain = pathname.startsWith("/tv");

  const isLibraryPage = pathname === "/movies" && searchParams.get("libraryId");
  const isPersonFilmography = pathname === "/movies" && searchParams.get("personId");
  const isMovieDetail = /^\/movies\/[^/]+$/.test(pathname);
  const isPersonDetail = /^\/people\/[^/]+$/.test(pathname);
  // TV browse route — the dedicated `/tv/browse` grid (peer of `/movies`). Its
  // library / filmography views get the same solid-header + back-nav + name
  // banner treatment as the cinema browse page, scoped to the TV domain.
  const isTvLibraryPage = pathname === "/tv/browse" && searchParams.get("libraryId");
  const isTvPersonFilmography = pathname === "/tv/browse" && searchParams.get("personId");
  // TV domain — mirrors the Cinema treatment: blended transparent header on the
  // TV home + show/person detail pages (their heroes paint a top scrim), and the
  // episode player hides the header entirely.
  const isTvHome = pathname === "/tv";
  // `/tv/browse` matches `/^\/tv\/[^/]+$/`, so exclude it explicitly — it is the
  // solid browse route, not a transparent show-detail page. Its own library /
  // filmography branch below owns the header.
  const isTvShowDetail = pathname !== "/tv/browse" && /^\/tv\/[^/]+$/.test(pathname);
  const isTvPersonDetail = /^\/tv\/people\/[^/]+$/.test(pathname);
  const isTvPlayerPage = /^\/tv\/episodes\/[^/]+\/play$/.test(pathname);
  // Music album/artist detail — solid-header back-nav (these pages are their own
  // scroll containers with a fanart-free layout, so they stay non-transparent).
  const isMusicDetail = /^\/music\/(albums|artists)\/[^/]+$/.test(pathname);
  const isPlayerPage = /^\/movies\/[^/]+\/play$/.test(pathname);
  const isSearchPage = pathname === "/search";
  const isProfilePage = pathname === "/profile";
  const isPreferencesPage = pathname.startsWith("/preferences");
  const needsBackNav = isMovieDetail || isPersonDetail || isMusicDetail || isSearchPage || isProfilePage || isPreferencesPage || isTvShowDetail || isTvPersonDetail;
  const libraryId = searchParams.get("libraryId");
  const personId = searchParams.get("personId");
  const filterGenre = searchParams.get("genre");
  const filterTag = searchParams.get("tag");
  const filterStudio = searchParams.get("studio");
  const filterLabel = filterGenre || filterTag || filterStudio;

  const { data: library } = useQuery<Library>({
    queryKey: ["library", libraryId],
    queryFn: () => fetch(`/api/libraries/${libraryId}`).then((r) => r.json()),
    // /api/libraries/{id} is domain-agnostic, so the same query feeds both the
    // cinema (`/movies`) and TV (`/tv/browse`) library banners.
    enabled: (!!isLibraryPage || !!isTvLibraryPage) && !!libraryId,
  });

  const { data: personData } = useQuery<{ name: string }>({
    queryKey: ["person-header", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
    enabled: !!isPersonFilmography && !!personId,
  });

  // TV person name for the `/tv/browse?personId=` filmography banner — hits the
  // isolated TV people endpoint ONLY (cross-domain reads are a sin: never the
  // cinema /api/people, whose ids live in a different table).
  const { data: tvPersonData } = useQuery<{ name: string }>({
    queryKey: ["tv-person-header", personId],
    queryFn: () => fetch(`/api/tv/people/${personId}`).then((r) => r.json()),
    enabled: !!isTvPersonFilmography && !!personId,
  });

  // Admin-only "Demo" pill while demo libraries or the shared demo/demo account
  // remain — the panel that removes them lives on the dashboard. Shares the
  // ["demo-status"] cache with that panel, so clearing there hides this too.
  const { data: demoStatus } = useQuery<{ hasDemo: boolean; hasDemoUser?: boolean }>({
    queryKey: ["demo-status"],
    queryFn: () => fetch("/api/setup/demo").then((r) => r.json()),
    enabled: isAdmin,
  });
  const showDemoBadge = isAdmin && (!!demoStatus?.hasDemo || !!demoStatus?.hasDemoUser);

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  if (isPlayerPage || isTvPlayerPage) return null;

  const isTransparent = isMovieDetail || isPersonDetail || pathname === "/" || isTvHome || isTvShowDetail || isTvPersonDetail;

  return (
    <header
      className={`app-header flex h-12 w-full items-center justify-between px-3 md:px-8 ${
        isTransparent
          ? "pointer-events-none absolute top-0 left-0 z-30 bg-transparent"
          : "bg-[var(--header)]"
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className={`transition-colors ${
            isTransparent
              ? "text-white/80 hover:text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Menu className="h-5 w-5" />
        </button>
        {isLibraryPage || isPersonFilmography || isTvLibraryPage || isTvPersonFilmography ? (
          <>
            <Link
              href={
                isTvPersonFilmography
                  ? `/tv/people/${personId}`
                  : isTvLibraryPage
                    ? "/tv"
                    : isPersonFilmography
                      ? `/people/${personId}`
                      : "/"
              }
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Link
              href={isTvLibraryPage || isTvPersonFilmography ? "/tv" : "/"}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <House className="h-5 w-5" />
            </Link>
            <span className="text-xl font-semibold text-foreground">
              {isTvPersonFilmography
                ? tvPersonData?.name || ""
                : isPersonFilmography
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
              href={isTvDomain ? "/tv" : "/"}
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
            {hasPhotoLibrary || hasMusicLibrary || hasTvLibrary ? (
              // Domain switcher lives on the brand as a low-frequency dropdown,
              // so the header keeps a single row of primary navigation instead
              // of two competing pill groups (see the home Tabs island).
              <DropdownMenu open={domainMenuOpen} onOpenChange={setDomainMenuOpen}>
                <DropdownMenuTrigger
                  className={`flex items-center gap-1.5 rounded-lg px-1 text-[1.375rem] font-bold outline-none transition-colors ${
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
                  // Kept mounted by Radix through its exit animation; hidden
                  // from the domain transition's NEW snapshot (globals.css).
                  data-vt-exit=""
                  className="flex w-64 flex-col gap-0.5 border-white/10 bg-black/70 p-1.5 backdrop-blur-xl"
                >
                  {domainItems.map((item) => (
                    // The card owns its look (hover/active/check); neutralize the
                    // item's own accent highlight + padding so Radix's
                    // focus-on-hover lands on the same tone as the card hover.
                    <DropdownMenuItem
                      key={item.domain}
                      asChild
                      className="cursor-pointer gap-3 rounded-lg px-3 py-0 focus:bg-white/[0.08] focus:text-foreground"
                    >
                      <DomainCard
                        size="menu"
                        {...item}
                        onClick={(e) => {
                          switchDomain(e, item);
                          setDomainMenuOpen(false);
                        }}
                      />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/" className="flex items-center gap-2 text-[1.375rem] font-bold text-foreground">
                <KubbyLogo className="h-7 w-7" />
                Kubby
              </Link>
            )}
          </>
        )}
      </div>
      <div className="pointer-events-auto flex items-center gap-4">
        {showDemoBadge && (
          <Link
            href="/dashboard#demo-data"
            title={tNav("demoBadgeTitle")}
            aria-label={tNav("demoBadgeTitle")}
            className="hidden items-center rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-2.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider text-amber-200/90 backdrop-blur-sm transition-colors hover:border-amber-300/40 hover:bg-amber-300/15 hover:text-amber-100 sm:inline-flex"
          >
            {tNav("demoBadge")}
          </Link>
        )}
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
    </header>
  );
}
