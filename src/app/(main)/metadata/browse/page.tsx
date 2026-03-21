"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { RefreshCw, Film, Users, Search } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { MovieMetadataEditor } from "@/components/movie/movie-metadata-editor";
import { PersonMetadataEditor } from "@/components/people/person-metadata-editor";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryClient } from "@tanstack/react-query";

type TabType = "movies" | "people";
type MissingFilter = "" | "any" | "overview" | "date" | "fanart";

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

export default function MetadataBrowsePage() {
  const t = useTranslations("dashboard");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("movies");
  const [missingFilter, setMissingFilter] = useState<MissingFilter>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [movieItems, setMovieItems] = useState<BrowseMovie[]>([]);
  const [personItems, setPersonItems] = useState<BrowsePerson[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Editor state
  const [editMovieId, setEditMovieId] = useState<string | null>(null);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchItems = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type: activeTab,
          page: String(pageNum),
          limit: "40",
        });
        if (missingFilter) params.set("missing", missingFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`/api/metadata/incomplete?${params}`);
        const data = await res.json();

        if (activeTab === "movies") {
          setMovieItems((prev) => (append ? [...prev, ...data.items] : data.items));
        } else {
          setPersonItems((prev) => (append ? [...prev, ...data.items] : data.items));
        }
        setTotal(data.total);
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, missingFilter, debouncedSearch]
  );

  // Reset and fetch page 1 when tab/filter/search changes
  useEffect(() => {
    setPage(1);
    setMovieItems([]);
    setPersonItems([]);
    fetchItems(1);
  }, [fetchItems]);

  const fetchNextPage = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(nextPage, true);
  }, [page, fetchItems]);

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setMovieItems([]);
    setPersonItems([]);
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

  const filters: { key: MissingFilter; label: string }[] = [
    { key: "", label: t("browseAll") },
    { key: "any", label: t("incomplete") },
    { key: "overview", label: t("missingOverview") },
    { key: "date", label: t("missingDate") },
    { key: "fanart", label: t("missingFanart") },
  ];

  return (
    <>
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {t("metadataBrowse")}
      </h1>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          {/* Tab Switcher */}
          <div className="inline-flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-fluid cursor-pointer ${
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

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
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

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setMissingFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-fluid cursor-pointer ${
                missingFilter === f.key
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-white/[0.03] text-muted-foreground border-white/[0.06] hover:bg-white/[0.05]"
              }`}
            >
              {f.label}
            </button>
          ))}
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
                    onClick={() => setEditMovieId(item.id)}
                  />
                ))
              : personItems.map((item) => (
                  <BrowsePersonCard
                    key={item.id}
                    item={item}
                    onClick={() => setEditPersonId(item.id)}
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

function BrowseMovieCard({ item, onClick }: { item: BrowseMovie; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasPoster = item.posterPath && !imgError;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer transition-[scale] duration-200 ease-out hover:scale-[1.03]"
      style={{ width: CARD_WIDTH }}
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
        <MissingDot count={item.missingFields.length} fields={item.missingFields} />
      </div>
      {/* Title */}
      <p className="mt-1.5 truncate text-center text-[13px] text-foreground">{item.title}</p>
      {item.year && (
        <p className="truncate text-center text-[11px] text-muted-foreground">{item.year}</p>
      )}
    </div>
  );
}

/* ── Lightweight Person Card ── */

function BrowsePersonCard({ item, onClick }: { item: BrowsePerson; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = item.photoPath && !imgError;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer transition-[scale] duration-200 ease-out hover:scale-[1.03]"
      style={{ width: CARD_WIDTH }}
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
        <MissingDot count={item.missingFields.length} fields={item.missingFields} />
      </div>
      {/* Name */}
      <p className="mt-1.5 truncate text-center text-[13px] text-foreground">{item.name}</p>
    </div>
  );
}

/* ── Missing indicator dot ── */

const missingLabelMap: Record<string, string> = {
  overview: "Overview",
  date: "Date",
  fanart: "Fanart",
};

function MissingDot({ count, fields }: { count: number; fields: string[] }) {
  if (count === 0) return null;
  const tooltip = fields.map((f) => missingLabelMap[f] || f).join(", ");
  return (
    <div
      className="absolute bottom-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/90 px-1 text-[10px] font-bold text-black shadow-sm"
      title={`Missing: ${tooltip}`}
    >
      {count}
    </div>
  );
}
