"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, CheckCircle, RefreshCw, Film, Users } from "lucide-react";
import { GlassToast } from "@/components/ui/glass-toast";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { useQueryClient } from "@tanstack/react-query";

type TabType = "movies" | "people";
type MissingFilter = "" | "overview" | "date" | "photo";

interface IncompleteMovie {
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

interface IncompletePerson {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  personalRating?: number | null;
  isFavorite?: boolean;
  missingFields: string[];
}

export default function MetadataCenterPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();

  // TMDB API key state
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [saving, setSaving] = useState(false);

  // NFO writeback state
  const [nfoWriteback, setNfoWriteback] = useState(true);
  const [nfoLoading, setNfoLoading] = useState(false);

  // Incomplete metadata state
  const [activeTab, setActiveTab] = useState<TabType>("movies");
  const [missingFilter, setMissingFilter] = useState<MissingFilter>("");
  const [movieItems, setMovieItems] = useState<IncompleteMovie[]>([]);
  const [personItems, setPersonItems] = useState<IncompletePerson[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(text: string, success: boolean) {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  // Load TMDB API key
  useEffect(() => {
    fetch("/api/settings/scraper")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(data.configured);
        setMaskedKey(data.tmdbApiKey);
      })
      .catch(console.error);
  }, []);

  // Load NFO writeback setting
  useEffect(() => {
    fetch("/api/settings/nfo-writeback")
      .then((r) => r.json())
      .then((data) => setNfoWriteback(data.enabled))
      .catch(console.error);
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/scraper", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbApiKey: apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        showToast(t("apiKeySaved"), true);
        setConfigured(true);
        setMaskedKey(apiKey.slice(0, 4) + "..." + apiKey.slice(-4));
        setApiKey("");
      } else {
        showToast(t("apiKeyInvalid"), false);
      }
    } catch {
      showToast(t("apiKeyInvalid"), false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNfoWriteback = async () => {
    const newValue = !nfoWriteback;
    setNfoWriteback(newValue);
    setNfoLoading(true);
    try {
      await fetch("/api/settings/nfo-writeback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newValue }),
      });
    } catch {
      setNfoWriteback(!newValue); // revert on error
    } finally {
      setNfoLoading(false);
    }
  };

  // Fetch incomplete metadata
  const fetchIncomplete = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type: activeTab,
          page: String(pageNum),
          limit: "40",
        });
        if (missingFilter) params.set("missing", missingFilter);

        const res = await fetch(`/api/metadata/incomplete?${params}`);
        const data = await res.json();

        if (activeTab === "movies") {
          setMovieItems((prev) => (append ? [...prev, ...data.items] : data.items));
        } else {
          setPersonItems((prev) => (append ? [...prev, ...data.items] : data.items));
        }
        setTotal(data.total);
      } catch (error) {
        console.error("Failed to fetch incomplete metadata:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, missingFilter]
  );

  // Reset and fetch when tab or filter changes
  useEffect(() => {
    setPage(1);
    setMovieItems([]);
    setPersonItems([]);
    fetchIncomplete(1);
  }, [fetchIncomplete]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchIncomplete(nextPage, true);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setMovieItems([]);
    setPersonItems([]);
    fetchIncomplete(1);
    // Also invalidate individual item caches so cards show fresh data
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
    { key: "", label: t("allIncomplete") },
    { key: "overview", label: t("missingOverview") },
    { key: "date", label: t("missingDate") },
    { key: "photo", label: t("missingPhoto") },
  ];

  return (
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {t("scraperSettings")}
      </h1>

      {/* Settings Card */}
      <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {t("metadataProviders")}
        </h2>

        {/* TMDB API Key */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("tmdbApiKey")}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? maskedKey : "Enter TMDB API key..."}
                className="h-11 w-full rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 pr-10 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={saving || !apiKey.trim()}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-fluid active:scale-95"
            >
              {saving ? "..." : tc("save")}
            </button>
          </div>
          <p className="text-xs text-[#555568]">{t("tmdbApiKeyHelp")}</p>
        </div>

        {configured && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            TMDB API key configured
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* NFO Writeback Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("nfoWriteback")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("nfoWritebackDesc")}
            </p>
          </div>
          <button
            onClick={handleToggleNfoWriteback}
            disabled={nfoLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-fluid cursor-pointer ${
              nfoWriteback ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                nfoWriteback ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Incomplete Metadata Section */}
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t("incompleteMetadata")}
          </h2>

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
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
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

        {/* Card Grid */}
        {loading && currentItems.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-sm text-muted-foreground">
              {t("allMetadataComplete")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {activeTab === "movies"
                ? movieItems.map((item) => (
                    <div key={item.id} className="flex flex-col">
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
                      <MissingBadges fields={item.missingFields} />
                    </div>
                  ))
                : personItems.map((item) => (
                    <div key={item.id} className="flex flex-col">
                      <PersonCard
                        id={item.id}
                        name={item.name}
                        photoPath={item.photoPath}
                        photoBlur={item.photoBlur}
                        personalRating={item.personalRating}
                        isFavorite={item.isFavorite}
                        size="sm"
                      />
                      <MissingBadges fields={item.missingFields} />
                    </div>
                  ))}
            </div>

            {/* Load More */}
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

      <GlassToast visible={!!toast} success={toast?.success}>
        {toast?.text}
      </GlassToast>
    </div>
  );
}

function MissingBadges({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;

  const labelMap: Record<string, string> = {
    overview: "No Overview",
    date: "No Date",
    photo: "No Photo",
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1.5 px-1">
      {fields.map((field) => (
        <span
          key={field}
          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400"
        >
          {labelMap[field] || field}
        </span>
      ))}
    </div>
  );
}
