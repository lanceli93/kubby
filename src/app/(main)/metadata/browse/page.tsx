"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Film, Users, Search } from "lucide-react";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { useQueryClient } from "@tanstack/react-query";

type TabType = "movies" | "people";
type MissingFilter = "" | "any" | "overview" | "date" | "photo";

interface BrowseMovie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isFavorite?: boolean;
  isPlayed?: boolean;
  missingFields: string[];
}

interface BrowsePerson {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  personalRating?: number | null;
  isFavorite?: boolean;
  missingFields: string[];
}

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

  // Reset and fetch when tab, filter, or search changes
  useEffect(() => {
    setPage(1);
    setMovieItems([]);
    setPersonItems([]);
    fetchItems(1);
  }, [fetchItems]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(nextPage, true);
  };

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

  const tabs: { key: TabType; label: string; icon: typeof Film }[] = [
    { key: "movies", label: "Movies", icon: Film },
    { key: "people", label: "People", icon: Users },
  ];

  const filters: { key: MissingFilter; label: string }[] = [
    { key: "", label: t("browseAll") },
    { key: "any", label: t("incomplete") },
    { key: "overview", label: t("missingOverview") },
    { key: "date", label: t("missingDate") },
    { key: "photo", label: t("missingPhoto") },
  ];

  return (
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {t("metadataBrowse")}
      </h1>

      {/* Controls Row */}
      <div className="flex flex-col gap-3">
        {/* Top: Tabs + Search + Count + Refresh */}
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
              placeholder={activeTab === "movies" ? "Search movies..." : "Search people..."}
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
          <div className="flex flex-wrap gap-4">
            {activeTab === "movies"
              ? movieItems.map((item) => (
                  <div key={item.id} className="relative" style={{ width: 150 }}>
                    <MovieCard
                      id={item.id}
                      title={item.title}
                      year={item.year}
                      posterPath={item.posterPath}
                      posterBlur={item.posterBlur}
                      rating={item.communityRating}
                      personalRating={item.personalRating}
                      videoWidth={item.videoWidth}
                      videoHeight={item.videoHeight}
                      isFavorite={item.isFavorite}
                      isWatched={item.isPlayed}
                      responsive
                    />
                    <MissingDot count={item.missingFields.length} fields={item.missingFields} />
                  </div>
                ))
              : personItems.map((item) => (
                  <div key={item.id} className="relative">
                    <PersonCard
                      id={item.id}
                      name={item.name}
                      photoPath={item.photoPath}
                      photoBlur={item.photoBlur}
                      personalRating={item.personalRating}
                      isFavorite={item.isFavorite}
                      size="sm"
                    />
                    <MissingDot count={item.missingFields.length} fields={item.missingFields} />
                  </div>
                ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-6 py-2.5 text-sm text-foreground hover:bg-white/[0.05] transition-fluid cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {loading ? "..." : t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
    </div>
  );
}

const missingLabelMap: Record<string, string> = {
  overview: "Overview",
  date: "Date",
  photo: "Photo",
};

function MissingDot({ count, fields }: { count: number; fields: string[] }) {
  if (count === 0) return null;

  const tooltip = fields.map((f) => missingLabelMap[f] || f).join(", ");

  return (
    <div
      className="absolute bottom-[52px] left-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/90 px-1 text-[10px] font-bold text-black shadow-sm"
      title={`Missing: ${tooltip}`}
    >
      {count}
    </div>
  );
}
