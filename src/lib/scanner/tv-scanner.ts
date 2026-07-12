import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import {
  mediaLibraries,
  settings,
  tvShows,
  tvSeasons,
  tvEpisodes,
  tvPeople,
  tvShowPeople,
  tvMediaStreams,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { parseTvShowNfo, type TvShowNfoData } from "./nfo-parser";
import { probeVideo } from "./probe";
import { scrapeTvShow, type ScrapedActorBio, type ScrapedSeason, type ScrapedEpisode } from "@/lib/scraper";
import { parseFolderPaths } from "@/lib/folder-paths";
import { generateBlurDataURL, getFileMtime } from "@/lib/blur-utils";
import { getTvPeopleMetadataDir, toRelativeDataPath } from "@/lib/paths";
import { computeAgeAtRelease } from "./index";
import type { ScanProgress, ScanResult, SkippedFolder } from "./index";

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".wmv", ".mov", ".flv", ".webm", ".m4v", ".ts", ".rmvb", ".rm"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];

// Junk directories to skip when walking a show tree.
const SKIP_DIRS = new Set(["@eaDir", "#recycle", ".thumbnails", ".stills"]);

// ─── Filename → season/episode parsing ─────────────────────────

export interface ParsedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  episodeNumberEnd?: number;
}

/**
 * Cross-check the season number against a parent folder like "Season 03" or
 * "Specials". Returns the folder-derived season if the folder names one, else null.
 */
function seasonFromParentFolder(parentFolderName: string): number | null {
  const seasonMatch = parentFolderName.match(/^Season\s*(\d{1,2})$/i);
  if (seasonMatch) return parseInt(seasonMatch[1], 10);
  if (/^Specials$/i.test(parentFolderName)) return 0;
  return null;
}

/** Reject seasons that are almost certainly a misread year (4-digit token). */
function isYearMisread(seasonNumber: number): boolean {
  return (seasonNumber >= 200 && seasonNumber <= 1927) || seasonNumber > 2500;
}

/**
 * Parse a season/episode from an episode filename. Ordered, first match wins:
 *   1. SxxExx (optionally -Exx / Exx for multi-episode single file)
 *   2. NxNN (season x episode)
 * Cross-checks against the immediate parent folder ("Season NN" / "Specials")
 * to supply a missing season, and rejects year-misread seasons. Returns null
 * when unparsable.
 */
export function parseEpisodeFilename(
  fileName: string,
  parentFolderName: string
): ParsedEpisode | null {
  const base = path.basename(fileName, path.extname(fileName));
  const folderSeason = seasonFromParentFolder(parentFolderName);

  // 1. SxxExx (with optional multi-episode end: S01E01-E03 or S01E01E03)
  const sxe = base.match(/S(\d{1,2})E(\d{1,3})(?:-?E(\d{1,3}))?/i);
  if (sxe) {
    let seasonNumber = parseInt(sxe[1], 10);
    const episodeNumber = parseInt(sxe[2], 10);
    const episodeNumberEnd = sxe[3] !== undefined ? parseInt(sxe[3], 10) : undefined;
    // Folder is authoritative when it names a season (handles Specials → 0).
    if (folderSeason !== null) seasonNumber = folderSeason;
    if (isYearMisread(seasonNumber)) return null;
    return { seasonNumber, episodeNumber, episodeNumberEnd };
  }

  // 2. NxNN — season (≤2 digits) x episode (≤3 digits). Must NOT match inside a
  //    resolution token like "1920x1080": require the x-token to be bounded by
  //    non-digits so a 4x4-digit resolution never parses as SxxExx.
  const nxn = base.match(/(?<!\d)(\d{1,2})x(\d{1,3})(?!\d)/);
  if (nxn) {
    let seasonNumber = parseInt(nxn[1], 10);
    const episodeNumber = parseInt(nxn[2], 10);
    if (folderSeason !== null) seasonNumber = folderSeason;
    if (isYearMisread(seasonNumber)) return null;
    return { seasonNumber, episodeNumber };
  }

  // 3. Filename gave nothing, but the parent folder names a season — still
  //    unparsable (no episode number available), so fall through to null.
  return null;
}

// ─── Filesystem walk ───────────────────────────────────────────

interface WalkedVideo {
  fullPath: string;
  /** Immediate parent folder name — used for Season/Specials cross-checking. */
  parentFolderName: string;
}

/** Recursively collect video files under a show dir, skipping junk dirs. */
function walkVideos(root: string): WalkedVideo[] {
  const results: WalkedVideo[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.warn(`Failed to read directory ${dir}:`, (e as Error).message);
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue; // dotfile / dot-directory
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(path.join(dir, name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!VIDEO_EXTENSIONS.includes(path.extname(name).toLowerCase())) continue;
      results.push({ fullPath: path.join(dir, name), parentFolderName: path.basename(dir) });
    }
  }

  walk(root);
  return results;
}

function findFileByPattern(dir: string, pattern: string, extensions: string[]): string | null {
  for (const ext of extensions) {
    const filePath = path.join(dir, pattern + ext);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

// ─── TV person resolution (isolated from cinema `people`) ──────

interface PersonBioData {
  tmdbId?: number;
  overview?: string;
  birthDate?: string;
  placeOfBirth?: string;
  deathDate?: string;
  imdbId?: string;
}

/**
 * Look up (or create) a person in the ISOLATED tv_people table. Mirrors
 * getOrCreatePerson in index.ts but never touches the cinema `people` table.
 */
function getOrCreateTvPerson(
  name: string,
  type: "actor" | "director" | "writer" | "producer",
  photoPath?: string,
  photoMtime?: number | null,
  photoBlur?: string | null,
  bio?: PersonBioData,
): string {
  const existing = db
    .select()
    .from(tvPeople)
    .where(and(eq(tvPeople.name, name), eq(tvPeople.type, type)))
    .get();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (photoPath && !existing.photoPath) {
      updates.photoPath = toRelativeDataPath(photoPath);
      updates.photoMtime = photoMtime ?? null;
      updates.photoBlur = photoBlur ?? null;
    }
    if (bio?.tmdbId && !existing.tmdbId) updates.tmdbId = String(bio.tmdbId);
    if (bio?.overview && !existing.overview) updates.overview = bio.overview;
    if (bio?.birthDate && !existing.birthDate) {
      updates.birthDate = bio.birthDate;
      updates.birthYear = parseInt(bio.birthDate.split("-")[0], 10) || null;
    }
    if (bio?.placeOfBirth && !existing.placeOfBirth) updates.placeOfBirth = bio.placeOfBirth;
    if (bio?.deathDate && !existing.deathDate) updates.deathDate = bio.deathDate;
    if (bio?.imdbId && !existing.imdbId) updates.imdbId = bio.imdbId;

    if (Object.keys(updates).length > 0) {
      db.update(tvPeople).set(updates).where(eq(tvPeople.id, existing.id)).run();
    }
    return existing.id;
  }

  const id = uuidv4();
  const birthYear = bio?.birthDate ? (parseInt(bio.birthDate.split("-")[0], 10) || null) : null;
  db.insert(tvPeople)
    .values({
      id,
      name,
      type,
      photoPath: photoPath ? toRelativeDataPath(photoPath) : null,
      photoMtime: photoMtime ?? null,
      photoBlur: photoBlur ?? null,
      tmdbId: bio?.tmdbId ? String(bio.tmdbId) : null,
      overview: bio?.overview || null,
      birthDate: bio?.birthDate || null,
      birthYear,
      placeOfBirth: bio?.placeOfBirth || null,
      deathDate: bio?.deathDate || null,
      imdbId: bio?.imdbId || null,
    })
    .run();
  return id;
}

// ─── Entry point ───────────────────────────────────────────────

type TvLibrary = typeof mediaLibraries.$inferSelect;

export async function scanTvShowLibrary(
  library: TvLibrary,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResult> {
  const folderPaths = parseFolderPaths(library.folderPath);
  if (folderPaths.length === 0) {
    throw new Error("Library has no folder paths configured");
  }

  const validPaths = folderPaths.filter((p) => {
    if (!fs.existsSync(p)) {
      console.warn(`Library path does not exist, skipping: ${p}`);
      return false;
    }
    return true;
  });

  if (validPaths.length === 0) {
    throw new Error(`No valid library paths found. Checked: ${folderPaths.join(", ")}`);
  }

  // Load scraper config if enabled.
  let apiKey: string | null = null;
  if (library.scraperEnabled) {
    const row = db.select().from(settings).where(eq(settings.key, "tmdb_api_key")).get();
    apiKey = row?.value ?? null;
  }
  const metadataLanguage = library.metadataLanguage || undefined;
  const metadataDir = getTvPeopleMetadataDir();

  // Enumerate top-level show directories from all valid roots.
  const showDirs: { name: string; fullPath: string }[] = [];
  for (const root of validPaths) {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        showDirs.push({ name: entry.name, fullPath: path.join(root, entry.name) });
      }
    }
  }

  // First pass: collect parseable episodes per show for a total-episode count
  // (progress is keyed on episode index across the whole library).
  interface ShowPlan {
    name: string;
    fullPath: string;
    episodes: { file: string; parsed: ParsedEpisode }[];
  }
  const plans: ShowPlan[] = [];
  let totalEpisodes = 0;
  for (const dir of showDirs) {
    const videos = walkVideos(dir.fullPath);
    const episodes: { file: string; parsed: ParsedEpisode }[] = [];
    for (const v of videos) {
      const parsed = parseEpisodeFilename(path.basename(v.fullPath), v.parentFolderName);
      if (parsed) episodes.push({ file: v.fullPath, parsed });
    }
    plans.push({ name: dir.name, fullPath: dir.fullPath, episodes });
    totalEpisodes += episodes.length;
  }

  let scannedCount = 0; // number of shows upserted
  let processedEpisodes = 0;
  let lastPctBucket = -1;
  const skipped: SkippedFolder[] = [];
  const scannedShowPaths = new Set<string>();
  const scannedEpisodePaths = new Set<string>();

  const emitProgress = (title: string) => {
    if (!onProgress || totalEpisodes === 0) return;
    const curPctBucket = Math.floor((processedEpisodes / totalEpisodes) * 20); // 0-20 → 5% steps
    if (processedEpisodes === 1 || processedEpisodes === totalEpisodes || curPctBucket > lastPctBucket) {
      onProgress({ current: processedEpisodes, total: totalEpisodes, title });
      lastPctBucket = curPctBucket;
    }
  };

  for (const plan of plans) {
    const showDir = plan.fullPath;

    // No parseable episodes → skip (reuse the closest existing reason).
    if (plan.episodes.length === 0) {
      skipped.push({ name: plan.name, reason: "no_video" });
      continue;
    }

    // Distinct seasons on disk, ascending.
    const distinctSeasons = Array.from(
      new Set(plan.episodes.map((e) => e.parsed.seasonNumber))
    ).sort((a, b) => a - b);

    // ── NFO / scrape ────────────────────────────────────────────
    let nfoPath = path.join(showDir, "tvshow.nfo");
    let scrapedActorBios: ScrapedActorBio[] | undefined;
    let scrapedSeasons: ScrapedSeason[] | undefined;

    if (!fs.existsSync(nfoPath) && library.scraperEnabled && apiKey && !library.jellyfinCompat) {
      try {
        const result = await scrapeTvShow(
          showDir,
          apiKey,
          metadataDir,
          metadataLanguage,
          distinctSeasons.map((seasonNumber) => ({ seasonNumber }))
        );
        if (result.success) {
          console.log(`Scraped TV metadata for: ${result.title}`);
          scrapedActorBios = result.actorBios;
          scrapedSeasons = result.seasons;
        } else {
          console.warn(`TV scraper skipped ${plan.name}: ${result.error}`);
        }
      } catch (e) {
        console.warn(`TV scraper error for ${plan.name}:`, e);
      }
    }

    // Parse show-level fields from the NFO. After scraping, we RE-READ the
    // tvshow.nfo we just wrote so there is ONE code path for show fields.
    let nfoData: TvShowNfoData;
    if (fs.existsSync(nfoPath)) {
      try {
        nfoData = parseTvShowNfo(fs.readFileSync(nfoPath, "utf-8"));
      } catch (e) {
        console.error(`Failed to parse tvshow.nfo in ${showDir}:`, e);
        skipped.push({ name: plan.name, reason: "nfo_parse_error" });
        // Advance episode progress so the bar stays consistent.
        for (const _ of plan.episodes) {
          processedEpisodes++;
          emitProgress(plan.name);
        }
        continue;
      }
    } else {
      // No NFO (scraper disabled / no API key / no TMDB match) — fall back to
      // the folder name as the title so the show is still catalogued.
      const folderTitle = plan.name.replace(/\s*\((\d{4})\)\s*$/, "").trim() || plan.name;
      const folderYearMatch = plan.name.match(/\((\d{4})\)\s*$/);
      nfoData = {
        title: folderTitle,
        year: folderYearMatch ? parseInt(folderYearMatch[1], 10) : undefined,
        genres: [],
        studios: [],
        actors: [],
        tags: [],
      };
      nfoPath = ""; // no NFO on disk
    }

    // ── Poster / fanart (relative to show dir) ─────────────────
    const posterFile =
      findFileByPattern(showDir, "poster", IMAGE_EXTENSIONS) ||
      findFileByPattern(showDir, "folder", IMAGE_EXTENSIONS) ||
      findFileByPattern(showDir, "cover", IMAGE_EXTENSIONS);
    const fanartFile =
      findFileByPattern(showDir, "fanart", IMAGE_EXTENSIONS) ||
      findFileByPattern(showDir, "backdrop", IMAGE_EXTENSIONS) ||
      findFileByPattern(showDir, "landscape", IMAGE_EXTENSIONS);

    const posterRelative = posterFile ? path.relative(showDir, posterFile) : null;
    const fanartRelative = fanartFile ? path.relative(showDir, fanartFile) : null;
    const posterMtime = posterFile ? getFileMtime(posterFile) : null;
    const fanartMtime = fanartFile ? getFileMtime(fanartFile) : null;
    const posterBlur = posterFile ? await generateBlurDataURL(posterFile) : null;

    // ── Upsert tvShows by folderPath ───────────────────────────
    const existingShow = db.select().from(tvShows).where(eq(tvShows.folderPath, showDir)).get();
    const showId = existingShow?.id || uuidv4();

    const showData = {
      id: showId,
      title: nfoData.title,
      originalTitle: nfoData.originalTitle || null,
      sortName: nfoData.sortName || null,
      overview: nfoData.overview || null,
      tagline: null,
      folderPath: showDir,
      posterPath: posterRelative,
      fanartPath: fanartRelative,
      nfoPath: nfoPath ? path.basename(nfoPath) : null,
      posterMtime,
      fanartMtime,
      posterBlur,
      communityRating: nfoData.communityRating || null,
      officialRating: nfoData.officialRating || null,
      premiereDate: nfoData.premiereDate || null,
      year: nfoData.year || null,
      status: nfoData.status || null,
      genres: JSON.stringify(nfoData.genres),
      studios: JSON.stringify(nfoData.studios),
      country: nfoData.country || null,
      tmdbId: nfoData.tmdbId || null,
      imdbId: nfoData.imdbId || null,
      tvdbId: nfoData.tvdbId || null,
      seasonCount: distinctSeasons.length,
      episodeCount: plan.episodes.length,
      tags: JSON.stringify(nfoData.tags),
      mediaLibraryId: library.id,
    };

    if (existingShow) {
      db.update(tvShows).set(showData).where(eq(tvShows.id, showId)).run();
    } else {
      db.insert(tvShows).values(showData).run();
    }
    scannedShowPaths.add(showDir);

    // Scraped metadata lookup maps.
    const scrapedSeasonMap = new Map<number, ScrapedSeason>();
    const scrapedEpisodeMap = new Map<string, ScrapedEpisode>();
    for (const s of scrapedSeasons ?? []) {
      scrapedSeasonMap.set(s.seasonNumber, s);
      for (const ep of s.episodes) {
        scrapedEpisodeMap.set(`${ep.seasonNumber}:${ep.episodeNumber}`, ep);
      }
    }

    // ── Upsert seasons ─────────────────────────────────────────
    const seasonIdByNumber = new Map<number, string>();
    for (const seasonNumber of distinctSeasons) {
      const scraped = scrapedSeasonMap.get(seasonNumber);
      const existingSeason = db
        .select()
        .from(tvSeasons)
        .where(and(eq(tvSeasons.showId, showId), eq(tvSeasons.seasonNumber, seasonNumber)))
        .get();
      const seasonId = existingSeason?.id || uuidv4();
      seasonIdByNumber.set(seasonNumber, seasonId);

      // Season poster (relative to showDir) + blur, when scraped one exists.
      let seasonPosterRel: string | null = null;
      let seasonPosterMtime: number | null = null;
      let seasonPosterBlur: string | null = null;
      if (scraped?.posterPath) {
        const abs = path.join(showDir, scraped.posterPath);
        if (fs.existsSync(abs)) {
          seasonPosterRel = scraped.posterPath;
          seasonPosterMtime = getFileMtime(abs);
          seasonPosterBlur = await generateBlurDataURL(abs);
        }
      }

      const defaultTitle = seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
      const airYear = scraped?.airDate ? parseInt(scraped.airDate.split("-")[0], 10) || null : null;

      const seasonData = {
        id: seasonId,
        showId,
        seasonNumber,
        title: scraped?.name || defaultTitle,
        overview: scraped?.overview || null,
        posterPath: seasonPosterRel,
        posterMtime: seasonPosterMtime,
        posterBlur: seasonPosterBlur,
        premiereDate: scraped?.airDate || null,
        year: airYear,
        tmdbId: null as string | null,
        episodeCount: plan.episodes.filter((e) => e.parsed.seasonNumber === seasonNumber).length,
      };

      if (existingSeason) {
        db.update(tvSeasons).set(seasonData).where(eq(tvSeasons.id, seasonId)).run();
      } else {
        db.insert(tvSeasons).values(seasonData).run();
      }
    }

    // ── Upsert episodes ────────────────────────────────────────
    for (const { file, parsed } of plan.episodes) {
      processedEpisodes++;
      emitProgress(path.basename(file));
      scannedEpisodePaths.add(file);

      const seasonId = seasonIdByNumber.get(parsed.seasonNumber)!;
      const scrapedEp = scrapedEpisodeMap.get(`${parsed.seasonNumber}:${parsed.episodeNumber}`);

      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch (e) {
        console.warn(`Failed to stat ${file}:`, (e as Error).message);
        continue;
      }
      const fileSize = stat.size;
      const dateModified = Math.floor(stat.mtimeMs);

      const existingEp = db.select().from(tvEpisodes).where(eq(tvEpisodes.filePath, file)).get();

      // Incremental skip: same size + mtime → reuse probe-derived fields and
      // skip the (expensive) re-probe, but still fix up season/show links.
      const unchanged =
        !!existingEp && existingEp.fileSize === fileSize && existingEp.dateModified === dateModified;

      const probeResult = unchanged ? null : await probeVideo(file);

      // Still image (relative to showDir) + blur, when scraped one exists.
      let stillRel: string | null = existingEp?.stillPath ?? null;
      let stillMtime: number | null = existingEp?.stillMtime ?? null;
      let stillBlur: string | null = existingEp?.stillBlur ?? null;
      if (scrapedEp?.stillPath) {
        const abs = path.join(showDir, scrapedEp.stillPath);
        if (fs.existsSync(abs)) {
          stillRel = scrapedEp.stillPath;
          stillMtime = getFileMtime(abs);
          stillBlur = await generateBlurDataURL(abs);
        }
      }

      // Probe fields: fresh probe takes priority; otherwise reuse the existing row.
      const videoCodec = unchanged ? existingEp!.videoCodec : (probeResult?.videoCodec ?? null);
      const audioCodec = unchanged ? existingEp!.audioCodec : (probeResult?.audioCodec ?? null);
      const videoWidth = unchanged ? existingEp!.videoWidth : (probeResult?.videoWidth ?? null);
      const videoHeight = unchanged ? existingEp!.videoHeight : (probeResult?.videoHeight ?? null);
      const audioChannels = unchanged ? existingEp!.audioChannels : (probeResult?.audioChannels ?? null);
      const container = unchanged
        ? existingEp!.container
        : (probeResult?.container || path.extname(file).toLowerCase().replace(".", "") || null);
      const totalBitrate = unchanged ? existingEp!.totalBitrate : (probeResult?.totalBitrate ?? null);
      const formatName = unchanged ? existingEp!.formatName : (probeResult?.formatName ?? null);
      const runtimeSeconds = unchanged
        ? existingEp!.runtimeSeconds
        : (probeResult?.durationSeconds ?? null);
      const runtimeMinutes = scrapedEp?.runtime
        ? scrapedEp.runtime
        : (unchanged
            ? existingEp!.runtimeMinutes
            : (probeResult?.durationSeconds ? Math.floor(probeResult.durationSeconds / 60) : null));

      const episodeId = existingEp?.id || uuidv4();
      const episodeData = {
        id: episodeId,
        showId,
        seasonId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        episodeNumberEnd: parsed.episodeNumberEnd ?? null,
        absoluteNumber: null as number | null,
        title: scrapedEp?.name || `Episode ${parsed.episodeNumber}`,
        overview: scrapedEp?.overview || null,
        filePath: file,
        nfoPath: null as string | null,
        stillPath: stillRel,
        stillMtime,
        stillBlur,
        airDate: scrapedEp?.airDate || null,
        communityRating: scrapedEp?.voteAverage ?? null,
        runtimeSeconds,
        runtimeMinutes,
        videoCodec,
        audioCodec,
        videoWidth,
        videoHeight,
        audioChannels,
        container,
        totalBitrate,
        fileSize,
        formatName,
        dateModified,
        tmdbId: null as string | null,
      };

      if (existingEp) {
        db.update(tvEpisodes).set(episodeData).where(eq(tvEpisodes.id, episodeId)).run();
      } else {
        db.insert(tvEpisodes).values(episodeData).run();
      }

      // Media streams: delete-then-reinsert, only when we re-probed.
      if (!unchanged) {
        db.delete(tvMediaStreams).where(eq(tvMediaStreams.episodeId, episodeId)).run();
        if (probeResult?.streams) {
          for (const stream of probeResult.streams) {
            db.insert(tvMediaStreams).values({
              id: uuidv4(),
              episodeId,
              streamIndex: stream.streamIndex,
              streamType: stream.streamType,
              codec: stream.codec,
              profile: stream.profile,
              bitrate: stream.bitrate,
              language: stream.language,
              title: stream.title,
              isDefault: stream.isDefault,
              isForced: stream.isForced,
              width: stream.width,
              height: stream.height,
              bitDepth: stream.bitDepth,
              frameRate: stream.frameRate,
              hdrType: stream.hdrType,
              pixFmt: stream.pixFmt,
              level: stream.level,
              hasBFrames: stream.hasBFrames,
              channels: stream.channels,
              channelLayout: stream.channelLayout,
              sampleRate: stream.sampleRate,
            }).run();
          }
        }
      }
    }

    // ── Cast → tvPeople / tvShowPeople ─────────────────────────
    db.delete(tvShowPeople).where(eq(tvShowPeople.showId, showId)).run();

    const actorBioMap = new Map<string, ScrapedActorBio>();
    for (const bio of scrapedActorBios ?? []) actorBioMap.set(bio.name, bio);

    for (const actor of nfoData.actors) {
      if (!actor.name) continue;

      // Actor thumb is a local path (scraped into the tv-people metadata dir, or
      // a Jellyfin-side <thumb> we read in place). HTTP thumbs are ignored so we
      // don't try to read blur/mtime off a URL.
      const thumb = actor.thumb && !actor.thumb.startsWith("http") ? actor.thumb : undefined;

      const scrapedBio = actorBioMap.get(actor.name);
      const bioData: PersonBioData | undefined = scrapedBio
        ? {
            tmdbId: scrapedBio.tmdbId,
            overview: scrapedBio.biography,
            birthDate: scrapedBio.birthday,
            placeOfBirth: scrapedBio.placeOfBirth,
            deathDate: scrapedBio.deathday,
            imdbId: scrapedBio.imdbId,
          }
        : actor.tmdbId
          ? { tmdbId: actor.tmdbId }
          : undefined;

      const actorMtime = thumb ? getFileMtime(thumb) : null;
      const actorBlur = thumb ? await generateBlurDataURL(thumb) : null;
      const personId = getOrCreateTvPerson(actor.name, "actor", thumb, actorMtime, actorBlur, bioData);

      const personRecord = db
        .select({ birthDate: tvPeople.birthDate, birthYear: tvPeople.birthYear })
        .from(tvPeople)
        .where(eq(tvPeople.id, personId))
        .get();
      const ageAtRelease = computeAgeAtRelease(
        personRecord?.birthDate,
        nfoData.premiereDate,
        nfoData.year,
        personRecord?.birthYear
      );

      db.insert(tvShowPeople)
        .values({
          id: uuidv4(),
          showId,
          personId,
          role: actor.role || null,
          sortOrder: actor.order ?? null,
          ageAtRelease,
        })
        .run();
    }

    scannedCount++;
  }

  // If the library was deleted mid-scan, skip destructive cleanup + the
  // lastScannedAt write so we don't touch state for a now-gone library.
  const stillExists = db
    .select({ id: mediaLibraries.id })
    .from(mediaLibraries)
    .where(eq(mediaLibraries.id, library.id))
    .get();
  if (!stillExists) {
    return { scannedCount, removedCount: 0, skipped };
  }

  // ─── Cleanup (FK-safe order: episodes → seasons → shows) ──────
  let removedCount = 0;

  const existingShowRows = db
    .select({ id: tvShows.id, folderPath: tvShows.folderPath })
    .from(tvShows)
    .where(eq(tvShows.mediaLibraryId, library.id))
    .all();

  // 1. Episodes whose file vanished (not in the scanned set). Scoped to shows in
  //    this library. FK cascade removes their tv_media_streams rows.
  for (const show of existingShowRows) {
    const eps = db
      .select({ id: tvEpisodes.id, filePath: tvEpisodes.filePath })
      .from(tvEpisodes)
      .where(eq(tvEpisodes.showId, show.id))
      .all();
    for (const ep of eps) {
      if (!scannedEpisodePaths.has(ep.filePath) && !fs.existsSync(ep.filePath)) {
        db.delete(tvEpisodes).where(eq(tvEpisodes.id, ep.id)).run();
      }
    }
  }

  // 2. Seasons with zero episodes.
  for (const show of existingShowRows) {
    const seasons = db
      .select({ id: tvSeasons.id })
      .from(tvSeasons)
      .where(eq(tvSeasons.showId, show.id))
      .all();
    for (const season of seasons) {
      const epCount = db
        .select({ id: tvEpisodes.id })
        .from(tvEpisodes)
        .where(eq(tvEpisodes.seasonId, season.id))
        .all().length;
      if (epCount === 0) {
        db.delete(tvSeasons).where(eq(tvSeasons.id, season.id)).run();
      }
    }
  }

  // 3. Shows with zero seasons whose folder wasn't scanned this run.
  for (const show of existingShowRows) {
    const seasonCount = db
      .select({ id: tvSeasons.id })
      .from(tvSeasons)
      .where(eq(tvSeasons.showId, show.id))
      .all().length;
    if (seasonCount === 0 && !scannedShowPaths.has(show.folderPath)) {
      db.delete(tvShows).where(eq(tvShows.id, show.id)).run();
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} TV shows no longer found in library paths`);
  }

  // Update last scanned timestamp.
  db.update(mediaLibraries)
    .set({ lastScannedAt: new Date().toISOString() })
    .where(eq(mediaLibraries.id, library.id))
    .run();

  return { scannedCount, removedCount, skipped };
}
