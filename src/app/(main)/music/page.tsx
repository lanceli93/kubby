"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { AlbumCard } from "@/components/music/album-card";
import { ArtistCard } from "@/components/music/artist-card";
import { TrackRow } from "@/components/music/track-row";
import { MusicItemMenu } from "@/components/music/music-item-menu";
import { MusicUploadButton } from "@/components/music/music-upload-button";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import { ArrowUpDown, CalendarPlus, ArrowDownAZ, Calendar, Timer, Hash, Loader2 } from "lucide-react";
import type { PlayerTrack } from "@/providers/music-player-provider";
import { useMusicPlayer } from "@/providers/music-player-provider";

interface AlbumItem {
  id: string;
  title: string;
  year?: number | null;
  coverPath?: string | null;
  coverBlur?: string | null;
  artistName?: string;
  trackCount?: number;
}

interface ArtistItem {
  id: string;
  name: string;
  imagePath?: string | null;
  imageBlur?: string | null;
  albumCount?: number;
  trackCount?: number;
}

interface SongItem {
  id: string;
  title: string;
  durationSeconds?: number | null;
  artistName?: string;
  albumId?: string | null;
  albumTitle?: string | null;
  coverPath?: string | null;
  coverBlur?: string | null;
  trackNumber?: number | null;
  isFavorite?: boolean;
}

interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

interface HomeResponse {
  recentAlbums: AlbumItem[];
  randomAlbums: AlbumItem[];
  mostPlayed: SongItem[];
}

const PAGE_SIZE = 60;

export default function MusicBrowsePage() {
  return (
    <Suspense>
      <MusicBrowseContent />
    </Suspense>
  );
}

function MusicBrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("music");
  // libraryId is optional — omitted, the API lists across all music libraries.
  const libraryId = searchParams.get("libraryId") || "";

  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "albums");

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      const params = new URLSearchParams(window.location.search);
      if (tab !== "albums") params.set("tab", tab);
      else params.delete("tab");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname]
  );

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
        <div className="relative flex justify-center border-b border-white/[0.06] bg-[var(--header)]">
          <TabsList variant="line">
            <TabsTrigger value="albums" className="transition-fluid cursor-pointer">{t("albums")}</TabsTrigger>
            <TabsTrigger value="artists" className="transition-fluid cursor-pointer">{t("artists")}</TabsTrigger>
            <TabsTrigger value="songs" className="transition-fluid cursor-pointer">{t("songs")}</TabsTrigger>
          </TabsList>
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <MusicUploadButton activeLibraryId={libraryId || undefined} />
          </div>
        </div>

        <div className="flex-1 overflow-y-scroll px-4 md:px-12">
          <TabsContent value="albums">
            <AlbumsTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="artists">
            <ArtistsTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="songs">
            <SongsTabContent libraryId={libraryId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─── Glass sort dropdown — a simplified port of the movies sort dropdown ───

interface SortOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function SortDropdown({
  options,
  sort,
  sortOrder,
  onSortChange,
  onOrderChange,
}: {
  options: SortOption[];
  sort: string;
  sortOrder: "asc" | "desc";
  onSortChange: (value: string) => void;
  onOrderChange: (order: "asc" | "desc") => void;
}) {
  const t = useTranslations("music");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="focus-ring glass-btn flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer"
      >
        <ArrowUpDown className="h-4 w-4" />
        {t("sortBy")}
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 w-[220px] -translate-x-1/2 rounded-[10px] border border-white/[0.08] bg-[rgba(10,10,15,0.78)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.1)] py-1.5">
          {options.map((option) => {
            const Icon = option.icon;
            const isActive = sort === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onSortChange(option.value)}
                className={`focus-ring flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  isActive
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-[#666680]"}`} />
                {option.label}
              </button>
            );
          })}
          <div className="my-1.5 border-t border-white/[0.06]" />
          <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t("sortOrder")}
          </p>
          <button
            onClick={() => onOrderChange("asc")}
            className={`focus-ring flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
              sortOrder === "asc" ? "bg-primary/[0.08] text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"
            }`}
          >
            <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "asc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
            {t("ascending")}
          </button>
          <button
            onClick={() => onOrderChange("desc")}
            className={`focus-ring flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
              sortOrder === "desc" ? "bg-primary/[0.08] text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"
            }`}
          >
            <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "desc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
            {t("descending")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Albums tab ───

function AlbumsTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("music");
  const [sort, setSort] = useState("dateAdded");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortOptions: SortOption[] = [
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "title", label: t("titleAZ"), icon: ArrowDownAZ },
    { value: "year", label: t("year"), icon: Calendar },
  ];

  const { data: home } = useQuery<HomeResponse>({
    queryKey: ["music-home", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/music/home?${params}`).then((r) => r.json());
    },
  });

  const {
    data: albumsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<AlbumItem>>({
    queryKey: ["music-albums", { libraryId, sort, sortOrder }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageParam));
      return fetch(`/api/music/albums?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const albums = albumsData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = albumsData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef } = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const recentAlbums = home?.recentAlbums ?? [];

  return (
    <div className="animate-fade-in-up">
      {/* Recently Added band */}
      {recentAlbums.length > 0 && (
        <section className="pt-6">
          <ScrollRow title={t("recentlyAdded")}>
            {recentAlbums.map((album) => (
              <AlbumCard
                key={album.id}
                id={album.id}
                title={album.title}
                artistName={album.artistName}
                coverPath={album.coverPath}
                coverBlur={album.coverBlur}
                year={album.year}
              />
            ))}
          </ScrollRow>
        </section>
      )}

      {/* Full album grid. Left-aligned (no justify-center) so the first column
          lines up with the "recently added" band + section heading above it;
          minmax columns stretch to fill the row so there's no centered gap. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,minmax(150px,180px))] md:gap-x-4 md:gap-y-6">
        <div className="col-span-full relative py-[18px] flex items-center justify-center">
          <span className="absolute left-0 text-sm text-muted-foreground whitespace-nowrap">
            {t("albumsCount", { count: totalCount || albums.length })}
          </span>
          <SortDropdown
            options={sortOptions}
            sort={sort}
            sortOrder={sortOrder}
            onSortChange={setSort}
            onOrderChange={setSortOrder}
          />
        </div>

        {albums.map((album, index) => (
          <AlbumCard
            key={album.id}
            id={album.id}
            title={album.title}
            artistName={album.artistName}
            coverPath={album.coverPath}
            coverBlur={album.coverBlur}
            year={album.year}
            responsive
            priority={index < 10}
          />
        ))}

        <div ref={sentinelRef} className="col-span-full" style={{ height: 1 }} />
        {isFetchingNextPage && (
          <div className="col-span-full flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && albums.length === 0 && (
          <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Artists tab ───

function ArtistsTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("music");
  const [sort, setSort] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sortOptions: SortOption[] = [
    { value: "name", label: t("nameAZ"), icon: ArrowDownAZ },
    { value: "albumCount", label: t("albums"), icon: Hash },
  ];

  const {
    data: artistsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<ArtistItem>>({
    queryKey: ["music-artists", { libraryId, sort, sortOrder }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageParam));
      return fetch(`/api/music/artists?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const artists = artistsData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = artistsData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef } = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <div className="animate-fade-in-up grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,minmax(150px,180px))] md:gap-x-4 md:gap-y-6">
      <div className="col-span-full relative py-[18px] flex items-center justify-center">
        <span className="absolute left-0 text-sm text-muted-foreground whitespace-nowrap">
          {t("artistsCount", { count: totalCount || artists.length })}
        </span>
        <SortDropdown
          options={sortOptions}
          sort={sort}
          sortOrder={sortOrder}
          onSortChange={setSort}
          onOrderChange={setSortOrder}
        />
      </div>

      {artists.map((artist, index) => (
        <ArtistCard
          key={artist.id}
          id={artist.id}
          name={artist.name}
          imagePath={artist.imagePath}
          imageBlur={artist.imageBlur}
          albumCount={artist.albumCount}
          responsive
          priority={index < 10}
        />
      ))}

      <div ref={sentinelRef} className="col-span-full" style={{ height: 1 }} />
      {isFetchingNextPage && (
        <div className="col-span-full flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && artists.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
          {t("empty")}
        </div>
      )}
    </div>
  );
}

// ─── Songs tab ───

/** Project a songs-list item into the player's PlayerTrack shape. */
function songToPlayerTrack(s: SongItem): PlayerTrack {
  return {
    id: s.id,
    title: s.title,
    artistName: s.artistName,
    albumId: s.albumId,
    albumTitle: s.albumTitle,
    coverPath: s.coverPath,
    coverBlur: s.coverBlur,
    durationSeconds: s.durationSeconds,
  };
}

function SongsTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("music");
  const queryClient = useQueryClient();
  const { playAlbum } = useMusicPlayer();
  const [sort, setSort] = useState("title");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sortOptions: SortOption[] = [
    { value: "title", label: t("titleAZ"), icon: ArrowDownAZ },
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "duration", label: t("duration"), icon: Timer },
  ];

  const songsQueryKey = ["music-songs", { libraryId, sort, sortOrder }] as const;

  const {
    data: songsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<SongItem>>({
    queryKey: songsQueryKey,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageParam));
      return fetch(`/api/music/songs?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const songs = songsData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = songsData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef } = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const toggleFavorite = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/music/tracks/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !current }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["music-songs"] }),
  });

  // Playing a row builds the whole loaded-songs list as the queue so the player
  // can advance through the browsed set.
  const handlePlay = (index: number) => {
    const queue = songs.map(songToPlayerTrack);
    if (queue.length > 0) playAlbum(queue, index);
  };

  return (
    <div className="animate-fade-in-up flex flex-col pb-6">
      <div className="relative py-[18px] flex items-center justify-center">
        <span className="absolute left-0 text-sm text-muted-foreground whitespace-nowrap">
          {t("songsCount", { count: totalCount || songs.length })}
        </span>
        <SortDropdown
          options={sortOptions}
          sort={sort}
          sortOrder={sortOrder}
          onSortChange={setSort}
          onOrderChange={setSortOrder}
        />
      </div>

      <div className="flex flex-col">
        {songs.map((song, index) => (
          <TrackRow
            key={song.id}
            id={song.id}
            title={song.title}
            artistName={song.artistName}
            durationSeconds={song.durationSeconds}
            isFavorite={song.isFavorite}
            coverPath={song.coverPath}
            coverBlur={song.coverBlur}
            albumTitle={song.albumTitle ?? undefined}
            albumId={song.albumId ?? undefined}
            showCover
            onPlay={() => handlePlay(index)}
            onToggleFavorite={() => toggleFavorite.mutate({ id: song.id, current: !!song.isFavorite })}
            menu={
              <MusicItemMenu
                type="track"
                id={song.id}
                initial={{ title: song.title, trackNumber: song.trackNumber }}
                invalidateKeys={[["music-songs"], ["music-albums"], ["music-home"]]}
              />
            }
          />
        ))}
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && songs.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {t("noSongs")}
        </div>
      )}
    </div>
  );
}
