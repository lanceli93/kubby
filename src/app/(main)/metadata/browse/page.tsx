"use client";

import { useState, useEffect, useCallback, useRef, memo, useTransition, useReducer } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { RefreshCw, Film, Users, Search, FileText, Calendar, ImageOff, Ruler, Cherry } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { MovieMetadataEditor } from "@/components/movie/movie-metadata-editor";
import { PersonMetadataEditor } from "@/components/people/person-metadata-editor";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryClient } from "@tanstack/react-query";

type TabType = "movies" | "people";
type MissingFilter = "" | "any" | "overview" | "date" | "fanart" | "height" | "cupSize";

interface BrowseMovie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  missingFields: string[];
}

interface BrowsePerson {
  id: string;
  name: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  missingFields: string[];
}

const CARD_WIDTH = 140;
const POSTER_HEIGHT = 210;

interface BrowseState {
  activeTab: TabType;
  missingFilter: MissingFilter;
  debouncedSearch: string;
  movieItems: BrowseMovie[];
  personItems: BrowsePerson[];
  total: number;
  page: number;
  loading: boolean;
  refreshing: boolean;
}

type BrowseAction =
  | { type: "SET_TAB"; tab: TabType }
  | { type: "SET_FILTER"; filter: MissingFilter }
  | { type: "SET_SEARCH"; search: string }
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; items: BrowseMovie[] | BrowsePerson[]; total: number; tab: TabType; append: boolean }
  | { type: "FETCH_ERROR" }
  | { type: "REFRESH_START" }
  | { type: "LOAD_NEXT_PAGE" };

function browseReducer(state: BrowseState, action: BrowseAction): BrowseState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab, missingFilter: (state.missingFilter === "height" || state.missingFilter === "cupSize") && action.tab === "movies" ? "" : state.missingFilter, page: 1, movieItems: [], personItems: [], loading: true };
    case "SET_FILTER":
      return { ...state, missingFilter: action.filter, page: 1, movieItems: [], personItems: [], loading: true };
    case "SET_SEARCH":
      return { ...state, debouncedSearch: action.search, page: 1, movieItems: [], personItems: [], loading: true };
    case "FETCH_START":
      return { ...state, loading: true };
    case "FETCH_SUCCESS":
      if (action.tab === "movies") {
        return { ...state, movieItems: action.append ? [...state.movieItems, ...action.items as BrowseMovie[]] : action.items as BrowseMovie[], total: action.total, loading: false, refreshing: false };
      }
      return { ...state, personItems: action.append ? [...state.personItems, ...action.items as BrowsePerson[]] : action.items as BrowsePerson[], total: action.total, loading: false, refreshing: false };
    case "FETCH_ERROR":
      return { ...state, loading: false, refreshing: false };
    case "REFRESH_START":
      return { ...state, refreshing: true, page: 1, movieItems: [], personItems: [], loading: true };
    case "LOAD_NEXT_PAGE":
      return { ...state, page: state.page + 1 };
    default:
      return state;
  }
}

export default function MetadataBrowsePage() {
  const t = useTranslations("dashboard");
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(browseReducer, {
    activeTab: "movies",
    missingFilter: "",
    debouncedSearch: "",
    movieItems: [],
    personItems: [],
    total: 0,
    page: 1,
    loading: false,
    refreshing: false,
  });

  const { activeTab, missingFilter, debouncedSearch, movieItems, personItems, total, page, loading, refreshing } = state;

  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Editor state
  const [editMovieId, setEditMovieId] = useState<string | null>(null);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const openMovieEditor = useCallback((id: string) => {
    startTransition(() => setEditMovieId(id));
  }, []);
  const openPersonEditor = useCallback((id: string) => {
    startTransition(() => setEditPersonId(id));
  }, []);

  // Debounce search input
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => dispatch({ type: "SET_SEARCH", search }), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Fetch data when tab/filter/search changes
  const fetchRef = useRef({ activeTab, missingFilter, debouncedSearch });
  fetchRef.current = { activeTab, missingFilter, debouncedSearch };

  const fetchItems = useCallback(
    async (pageNum: number, append = false) => {
      const { activeTab: tab, missingFilter: filter, debouncedSearch: q } = fetchRef.current;
      try {
        const params = new URLSearchParams({ type: tab, page: String(pageNum), limit: "40" });
        if (filter) params.set("missing", filter);
        if (q) params.set("search", q);

        const res = await fetch(`/api/metadata/incomplete?${params}`);
        const data = await res.json();
        dispatch({ type: "FETCH_SUCCESS", items: data.items, total: data.total, tab, append });
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
        dispatch({ type: "FETCH_ERROR" });
      }
    },
    []
  );

  // Trigger fetch on tab/filter/search change
  useEffect(() => {
    fetchItems(1);
  }, [activeTab, missingFilter, debouncedSearch, fetchItems]);

  const fetchNextPage = useCallback(() => {
    dispatch({ type: "LOAD_NEXT_PAGE" });
    fetchItems(page + 1, true);
  }, [page, fetchItems]);

  const handleRefresh = () => {
    dispatch({ type: "REFRESH_START" });
    fetchItems(1);
    queryClient.invalidateQueries({ queryKey: ["movie"] });
    queryClient.invalidateQueries({ queryKey: ["person"] });
  };

  const currentItems = activeTab === "movies" ? movieItems : personItems;
  const hasMore = currentItems.length < total;

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage: hasMore,
    isFetchingNextPage: loading,
    fetchNextPage,
  });

  const tabs: { key: TabType; label: string; icon: typeof Film }[] = [
    { key: "movies", label: "Movies", icon: Film },
    { key: "people", label: "Actors", icon: Users },
  ];

  const filters: { key: MissingFilter; label: string; icon?: typeof FileText }[] = [
    { key: "", label: t("browseAll") },
    { key: "any", label: t("incomplete") },
    { key: "overview", label: t("missingOverview"), icon: FileText },
    { key: "date", label: t("missingDate"), icon: Calendar },
    { key: "fanart", label: t("missingFanart"), icon: ImageOff },
    ...(activeTab === "people" ? [
      { key: "height" as MissingFilter, label: t("missingHeight"), icon: Ruler },
      { key: "cupSize" as MissingFilter, label: t("missingCupSize"), icon: Cherry },
    ] : []),
  ];

  return (
    <>
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col gap-6 p-4 sm:p-8 sm:px-10">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        {t("metadataBrowse")}
      </h1>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {/* Row 1: Tabs + Search (desktop) + Count */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Tab Switcher */}
          <div className="inline-flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => dispatch({ type: "SET_TAB", tab: tab.key })}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-fluid cursor-pointer ${
                    activeTab === tab.key
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search — inline on desktop */}
          <div className="relative hidden sm:block flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === "movies" ? "Search movies..." : "Search actors..."}
              className="h-9 w-full rounded-md border border-white/[0.06] bg-white/[0.05] pl-9 pr-3 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
            />
          </div>

          {/* Count + Refresh */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">
              {t("itemsCount", { count: total })}
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg p-2 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-fluid cursor-pointer"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Search — own row on mobile */}
        <div className="relative sm:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "movies" ? "Search movies..." : "Search actors..."}
            className="h-9 w-full rounded-md border border-white/[0.06] bg-white/[0.05] pl-9 pr-3 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => dispatch({ type: "SET_FILTER", filter: f.key })}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-fluid cursor-pointer ${
                  missingFilter === f.key
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-white/[0.03] text-muted-foreground border-white/[0.06] hover:bg-white/[0.05]"
                }`}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Card Grid */}
      {loading && currentItems.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Loading...
        </div>
      ) : currentItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-sm text-muted-foreground">
            {debouncedSearch ? t("noSearchResults") : t("noItems")}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {activeTab === "movies"
              ? movieItems.map((item) => (
                  <BrowseMovieCard
                    key={item.id}
                    item={item}
                    onSelect={openMovieEditor}
                  />
                ))
              : personItems.map((item) => (
                  <BrowsePersonCard
                    key={item.id}
                    item={item}
                    onSelect={openPersonEditor}
                  />
                ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
        </>
      )}
    </div>
    </div>

    {/* Editors — rendered once, outside the scroll container */}
    {editMovieId && (
      <MovieMetadataEditor
        movieId={editMovieId}
        open={true}
        onOpenChange={(open) => { if (!open) setEditMovieId(null); }}
      />
    )}
    {editPersonId && (
      <PersonMetadataEditor
        personId={editPersonId}
        open={true}
        onOpenChange={(open) => { if (!open) setEditPersonId(null); }}
      />
    )}
    </>
  );
}

/* ── Lightweight Movie Card ── */

const BrowseMovieCard = memo(function BrowseMovieCard({ item, onSelect }: { item: BrowseMovie; onSelect: (id: string) => void }) {
  const [imgError, setImgError] = useState(false);
  const hasPoster = item.posterPath && !imgError;

  return (
    <div
      onClick={() => onSelect(item.id)}
      className="group cursor-pointer transition-[scale] duration-200 ease-out hover:scale-[1.03]"
      style={{ width: CARD_WIDTH, contentVisibility: "auto", containIntrinsicSize: `${CARD_WIDTH}px ${POSTER_HEIGHT + 40}px` }}
    >
      {/* Poster */}
      <div
        className="relative overflow-hidden rounded-lg bg-white/[0.04]"
        style={{ height: POSTER_HEIGHT }}
      >
        {hasPoster ? (
          <Image
            src={resolveImageSrc(item.posterPath!, CARD_WIDTH * 2)}
            alt={item.title}
            fill
            className="object-cover"
            sizes={`${CARD_WIDTH}px`}
            placeholder={item.posterBlur ? "blur" : undefined}
            blurDataURL={item.posterBlur || undefined}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Film className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        <MissingIndicators fields={item.missingFields} />
      </div>
      {/* Title */}
      <p className="mt-1.5 truncate text-center text-[13px] text-foreground">{item.title}</p>
      {item.year && (
        <p className="truncate text-center text-[11px] text-muted-foreground">{item.year}</p>
      )}
    </div>
  );
});

/* ── Lightweight Person Card ── */

const BrowsePersonCard = memo(function BrowsePersonCard({ item, onSelect }: { item: BrowsePerson; onSelect: (id: string) => void }) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = item.photoPath && !imgError;

  return (
    <div
      onClick={() => onSelect(item.id)}
      className="group cursor-pointer transition-[scale] duration-200 ease-out hover:scale-[1.03]"
      style={{ width: CARD_WIDTH, contentVisibility: "auto", containIntrinsicSize: `${CARD_WIDTH}px ${POSTER_HEIGHT + 40}px` }}
    >
      {/* Photo */}
      <div
        className="relative overflow-hidden rounded-lg bg-white/[0.04]"
        style={{ height: POSTER_HEIGHT }}
      >
        {hasPhoto ? (
          <Image
            src={resolveImageSrc(item.photoPath!, CARD_WIDTH * 2)}
            alt={item.name}
            fill
            className="object-cover"
            sizes={`${CARD_WIDTH}px`}
            placeholder={item.photoBlur ? "blur" : undefined}
            blurDataURL={item.photoBlur || undefined}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl font-semibold text-muted-foreground/30">
            {item.name.charAt(0)}
          </div>
        )}
        <MissingIndicators fields={item.missingFields} />
      </div>
      {/* Name */}
      <p className="mt-1.5 truncate text-center text-[13px] text-foreground">{item.name}</p>
    </div>
  );
});

/* ── Missing field icon indicators ── */

const missingIconMap: Record<string, { icon: typeof FileText; label: string }> = {
  overview: { icon: FileText, label: "Overview" },
  date: { icon: Calendar, label: "Date" },
  fanart: { icon: ImageOff, label: "Fanart" },
  height: { icon: Ruler, label: "Height" },
  cupSize: { icon: Cherry, label: "Cup Size" },
};

function MissingIndicators({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <div className="absolute bottom-1.5 left-1.5 flex gap-1">
      {fields.map((f) => {
        const entry = missingIconMap[f];
        if (!entry) return null;
        const Icon = entry.icon;
        return (
          <div
            key={f}
            className="flex h-5 w-5 items-center justify-center rounded-md bg-black/60 backdrop-blur-sm"
            title={`Missing: ${entry.label}`}
          >
            <Icon className="h-3 w-3 text-amber-400" />
          </div>
        );
      })}
    </div>
  );
}
