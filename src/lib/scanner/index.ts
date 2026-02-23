import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { movies, people, moviePeople, mediaLibraries, settings, mediaStreams, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { parseNfo } from "./nfo-parser";
import { probeVideo } from "./probe";
import { scrapeMovie } from "@/lib/scraper";
import { writeActorsToNfo } from "./nfo-writer";
import { fetchMovieCredits, downloadTmdbImage, getPersonPhotoPath, TMDB_PROFILE_SIZE } from "@/lib/tmdb";
import { parseFolderPaths } from "@/lib/folder-paths";
import { generateBlurDataURL, getFileMtime } from "@/lib/blur-utils";
import { getPeopleMetadataDir } from "@/lib/paths";

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".wmv", ".mov", ".flv", ".webm", ".m4v"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];

function findFile(dir: string, baseName: string, extensions: string[]): string | null {
  for (const ext of extensions) {
    const filePath = path.join(dir, baseName + ext);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function findFileByPattern(dir: string, pattern: string, extensions: string[]): string | null {
  for (const ext of extensions) {
    const filePath = path.join(dir, pattern + ext);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function findVideoFile(dir: string): string | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (VIDEO_EXTENSIONS.includes(ext)) {
      return path.join(dir, file);
    }
  }
  return null;
}

// ─── Multi-Disc Detection ─────────────────────────────────────

interface DiscInfo {
  discNumber: number;
  filePath: string;
  label: string;
}

const MULTI_DISC_REGEX = /[\s._\-\[\(]*(cd|dvd|disc|disk|part|pt)[\s._\-]*(\d+|[a-d])[\s._\-\]\)]*/i;

function findVideoFiles(dir: string): string[] {
  const files = fs.readdirSync(dir);
  return files
    .filter((file) => VIDEO_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .sort()
    .map((file) => path.join(dir, file));
}

function detectMultiDisc(videoPaths: string[]): DiscInfo[] | null {
  const results: DiscInfo[] = [];
  for (const filePath of videoPaths) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const match = fileName.match(MULTI_DISC_REGEX);
    if (match) {
      const keyword = match[1]; // cd, dvd, disc, part, etc.
      const numStr = match[2];
      const discNumber = /^\d+$/.test(numStr) ? parseInt(numStr, 10) : (numStr.charCodeAt(0) - 96); // a=1, b=2…
      const label = `${keyword.toUpperCase()} ${numStr.toUpperCase()}`;
      results.push({ discNumber, filePath, label });
    }
  }
  if (results.length < 2) return null;
  results.sort((a, b) => a.discNumber - b.discNumber);
  return results;
}

function findDiscPoster(movieDir: string, discInfo: DiscInfo): string | null {
  const n = discInfo.discNumber;
  const videoBaseName = path.basename(discInfo.filePath, path.extname(discInfo.filePath));
  const patterns = [
    `poster-disc${n}`,
    `poster-cd${n}`,
    `${videoBaseName}-poster`,
  ];
  for (const pattern of patterns) {
    const found = findFileByPattern(movieDir, pattern, IMAGE_EXTENSIONS);
    if (found) return path.relative(movieDir, found);
  }
  return null;
}

function getOrCreatePerson(
  name: string,
  type: "actor" | "director" | "writer" | "producer",
  photoPath?: string,
  photoMtime?: number | null,
  photoBlur?: string | null,
): string {
  // Case-insensitive lookup
  const existing = db
    .select()
    .from(people)
    .where(
      and(
        eq(people.name, name),
        eq(people.type, type)
      )
    )
    .get();

  if (existing) {
    // Update photoPath if we now have one and the existing record doesn't
    if (photoPath && !existing.photoPath) {
      db.update(people)
        .set({ photoPath, photoMtime: photoMtime ?? null, photoBlur: photoBlur ?? null })
        .where(eq(people.id, existing.id))
        .run();
    }
    return existing.id;
  }

  const id = uuidv4();
  db.insert(people)
    .values({ id, name, type, photoPath: photoPath || null, photoMtime: photoMtime ?? null, photoBlur: photoBlur ?? null })
    .run();
  return id;
}

export type ScanProgress = { current: number; total: number; title: string };

export async function scanLibrary(
  libraryId: string,
  onProgress?: (progress: ScanProgress) => void
) {
  const library = db
    .select()
    .from(mediaLibraries)
    .where(eq(mediaLibraries.id, libraryId))
    .get();

  if (!library) throw new Error("Library not found");

  const folderPaths = parseFolderPaths(library.folderPath);
  if (folderPaths.length === 0) {
    throw new Error("Library has no folder paths configured");
  }

  // Validate paths — skip missing ones with a warning instead of failing
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

  // Load scraper config if enabled
  let apiKey: string | null = null;
  if (library.scraperEnabled) {
    const row = db.select().from(settings).where(eq(settings.key, "tmdb_api_key")).get();
    apiKey = row?.value ?? null;
  }
  const metadataLanguage = library.metadataLanguage || undefined;

  const metadataDir = getPeopleMetadataDir();

  // Aggregate all movie directories from all valid paths
  const dirs: { name: string; fullPath: string }[] = [];
  for (const folderPath of validPaths) {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, fullPath: path.join(folderPath, entry.name) });
      }
    }
  }

  let scannedCount = 0;
  let lastPctBucket = -1;

  for (let i = 0; i < dirs.length; i++) {
    const entry = dirs[i];
    const movieDir = entry.fullPath;

    // Throttled progress: emit at every 5% boundary, plus first and last
    if (onProgress) {
      const curPctBucket = Math.floor(((i + 1) / dirs.length) * 20); // 0-20
      if (i === 0 || i === dirs.length - 1 || curPctBucket > lastPctBucket) {
        onProgress({ current: i + 1, total: dirs.length, title: entry.name });
        lastPctBucket = curPctBucket;
      }
    }

    // Find NFO file
    let nfoPath = path.join(movieDir, "movie.nfo");

    // If no movie.nfo, check for video-named NFO (e.g., Inception.mp4 -> Inception.nfo)
    if (!fs.existsSync(nfoPath)) {
      const videoFile = findVideoFile(movieDir);
      if (videoFile) {
        const videoBaseName = path.basename(videoFile, path.extname(videoFile));
        const videoNamedNfo = path.join(movieDir, videoBaseName + ".nfo");
        if (fs.existsSync(videoNamedNfo)) {
          // In Jellyfin compat mode, read the NFO in-place without copying
          if (library.jellyfinCompat) {
            nfoPath = videoNamedNfo;
          } else {
            fs.copyFileSync(videoNamedNfo, nfoPath);
            console.log(`Copied ${videoBaseName}.nfo -> movie.nfo in ${entry.name}`);
          }
        }
      }
    }

    // If no NFO and scraper is enabled, try to scrape from TMDB
    // Skip scraper NFO creation in Jellyfin compat mode (would write NFO files)
    if (!fs.existsSync(nfoPath) && library.scraperEnabled && apiKey && !library.jellyfinCompat) {
      try {
        const result = await scrapeMovie(movieDir, apiKey, metadataDir, metadataLanguage);
        if (result.success) {
          console.log(`Scraped metadata for: ${result.title}`);
        } else {
          console.warn(`Scraper skipped ${entry.name}: ${result.error}`);
        }
      } catch (e) {
        console.warn(`Scraper error for ${entry.name}:`, e);
      }
    }

    if (!fs.existsSync(nfoPath)) continue;

    // Find video files (multi-disc detection)
    const videoFiles = findVideoFiles(movieDir);
    if (videoFiles.length === 0) continue;
    const multiDiscResult = detectMultiDisc(videoFiles);
    const isMultiDisc = multiDiscResult != null && multiDiscResult.length >= 2;
    const primaryVideo = isMultiDisc ? multiDiscResult[0].filePath : videoFiles[0];

    // Parse NFO
    let nfoData;
    try {
      const nfoContent = fs.readFileSync(nfoPath, "utf-8");
      nfoData = parseNfo(nfoContent);
    } catch (e) {
      console.error(`Failed to parse NFO in ${movieDir}:`, e);
      continue;
    }

    // If NFO has no actors but has a TMDB ID, supplement from TMDB
    if (nfoData.actors.length === 0 && nfoData.tmdbId && library.scraperEnabled && apiKey) {
      try {
        const credits = await fetchMovieCredits(nfoData.tmdbId, apiKey, metadataLanguage);
        const topCast = (credits.cast ?? []).slice(0, 20);

        for (const actor of topCast) {
          if (actor.profile_path) {
            try {
              const photoPath = getPersonPhotoPath(metadataDir, actor.name);
              await downloadTmdbImage(actor.profile_path, photoPath, TMDB_PROFILE_SIZE);
            } catch {
              // non-critical
            }
          }
        }

        const actorEntries = topCast.map((actor) => ({
          name: actor.name,
          role: actor.character,
          thumb: actor.profile_path
            ? getPersonPhotoPath(metadataDir, actor.name)
            : undefined,
          order: actor.order,
        }));

        // Skip NFO write in Jellyfin compat mode
        if (!library.jellyfinCompat) {
          writeActorsToNfo(nfoPath, actorEntries);
        }

        nfoData.actors = actorEntries.map((a) => ({
          name: a.name,
          role: a.role,
          thumb: a.thumb,
          order: a.order,
        }));

        console.log(`Supplemented ${topCast.length} actors for: ${nfoData.title}`);
      } catch (e) {
        console.warn(`Failed to supplement actors for ${entry.name}:`, e);
      }
    }

    // Find poster and fanart (relative to movie dir)
    const posterFile = findFileByPattern(movieDir, "poster", IMAGE_EXTENSIONS)
      || findFileByPattern(movieDir, "folder", IMAGE_EXTENSIONS)
      || findFileByPattern(movieDir, "cover", IMAGE_EXTENSIONS);
    const fanartFile = findFileByPattern(movieDir, "fanart", IMAGE_EXTENSIONS)
      || findFileByPattern(movieDir, "landscape", IMAGE_EXTENSIONS)
      || findFileByPattern(movieDir, "backdrop", IMAGE_EXTENSIONS);

    const posterRelative = posterFile ? path.relative(movieDir, posterFile) : null;
    const fanartRelative = fanartFile ? path.relative(movieDir, fanartFile) : null;

    // Image mtime + blur placeholder
    const posterMtime = posterFile ? getFileMtime(posterFile) : null;
    const fanartMtime = fanartFile ? getFileMtime(fanartFile) : null;
    const posterBlur = posterFile ? await generateBlurDataURL(posterFile) : null;

    // Probe primary video file with ffprobe for media info
    const probeResult = await probeVideo(primaryVideo);

    // ffprobe data takes priority over NFO data (more accurate)
    const videoCodec = probeResult?.videoCodec || nfoData.videoCodec || null;
    const audioCodec = probeResult?.audioCodec || nfoData.audioCodec || null;
    const videoWidth = probeResult?.videoWidth || nfoData.videoWidth || null;
    const videoHeight = probeResult?.videoHeight || nfoData.videoHeight || null;
    const audioChannels = probeResult?.audioChannels || nfoData.audioChannels || null;
    const container = probeResult?.container || path.extname(primaryVideo).toLowerCase().replace(".", "") || null;
    // Runtime: prefer NFO/TMDB value, fall back to ffprobe duration
    const runtimeSeconds = probeResult?.durationSeconds || (nfoData.runtimeMinutes ? nfoData.runtimeMinutes * 60 : null);
    const runtimeMinutes = nfoData.runtimeMinutes || (probeResult?.durationSeconds ? Math.floor(probeResult.durationSeconds / 60) : null);

    // Check if movie already exists by folder path (idempotent)
    const existingMovie = db
      .select()
      .from(movies)
      .where(eq(movies.folderPath, movieDir))
      .get();

    const movieId = existingMovie?.id || uuidv4();

    const movieData = {
      id: movieId,
      title: nfoData.title,
      originalTitle: nfoData.originalTitle || null,
      sortName: nfoData.sortName || null,
      overview: nfoData.overview || null,
      tagline: nfoData.tagline || null,
      filePath: primaryVideo,
      folderPath: movieDir,
      posterPath: posterRelative,
      fanartPath: fanartRelative,
      posterMtime,
      fanartMtime,
      posterBlur,
      nfoPath: "movie.nfo",
      communityRating: nfoData.communityRating || null,
      officialRating: nfoData.officialRating || null,
      runtimeMinutes: runtimeMinutes,
      runtimeSeconds: runtimeSeconds,
      premiereDate: nfoData.premiereDate || null,
      year: nfoData.year || null,
      genres: JSON.stringify(nfoData.genres),
      studios: JSON.stringify(nfoData.studios),
      country: nfoData.country || null,
      tmdbId: nfoData.tmdbId || null,
      imdbId: nfoData.imdbId || null,
      videoCodec,
      audioCodec,
      videoWidth,
      videoHeight,
      audioChannels,
      container,
      totalBitrate: probeResult?.totalBitrate || null,
      fileSize: probeResult?.fileSize || null,
      formatName: probeResult?.formatName || null,
      discCount: isMultiDisc ? multiDiscResult.length : 1,
      tags: JSON.stringify(nfoData.tags),
      mediaLibraryId: libraryId,
    };

    if (existingMovie) {
      db.update(movies)
        .set(movieData)
        .where(eq(movies.id, movieId))
        .run();
    } else {
      db.insert(movies).values(movieData).run();
    }

    // Clear and re-insert media streams
    db.delete(mediaStreams).where(eq(mediaStreams.movieId, movieId)).run();
    if (probeResult?.streams) {
      for (const stream of probeResult.streams) {
        db.insert(mediaStreams).values({
          id: uuidv4(),
          movieId,
          discNumber: 1,
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
          channels: stream.channels,
          channelLayout: stream.channelLayout,
          sampleRate: stream.sampleRate,
        }).run();
      }
    }

    // Multi-disc: probe each disc, insert movie_discs rows and per-disc streams
    db.delete(movieDiscs).where(eq(movieDiscs.movieId, movieId)).run();
    if (isMultiDisc) {
      let totalRuntimeSeconds = 0;
      for (const disc of multiDiscResult) {
        const discProbe = disc.filePath === primaryVideo ? probeResult : await probeVideo(disc.filePath);
        const discPoster = findDiscPoster(movieDir, disc);
        const discExt = path.extname(disc.filePath).toLowerCase().replace(".", "");

        db.insert(movieDiscs).values({
          id: uuidv4(),
          movieId,
          discNumber: disc.discNumber,
          filePath: disc.filePath,
          label: disc.label,
          posterPath: discPoster,
          runtimeSeconds: discProbe?.durationSeconds || null,
          fileSize: discProbe?.fileSize || null,
          videoCodec: discProbe?.videoCodec || null,
          audioCodec: discProbe?.audioCodec || null,
          videoWidth: discProbe?.videoWidth || null,
          videoHeight: discProbe?.videoHeight || null,
          audioChannels: discProbe?.audioChannels || null,
          container: discProbe?.container || discExt || null,
          totalBitrate: discProbe?.totalBitrate || null,
          formatName: discProbe?.formatName || null,
        }).run();

        if (discProbe?.durationSeconds) {
          totalRuntimeSeconds += discProbe.durationSeconds;
        }

        // Insert per-disc media streams (skip disc 1 — already inserted above)
        if (disc.discNumber > 1 && discProbe?.streams) {
          for (const stream of discProbe.streams) {
            db.insert(mediaStreams).values({
              id: uuidv4(),
              movieId,
              discNumber: disc.discNumber,
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
              channels: stream.channels,
              channelLayout: stream.channelLayout,
              sampleRate: stream.sampleRate,
            }).run();
          }
        }
      }

      // Update total runtime to sum of all discs
      if (totalRuntimeSeconds > 0) {
        db.update(movies)
          .set({
            runtimeSeconds: totalRuntimeSeconds,
            runtimeMinutes: Math.floor(totalRuntimeSeconds / 60),
          })
          .where(eq(movies.id, movieId))
          .run();
      }
    }

    // Clear existing people associations for this movie
    db.delete(moviePeople).where(eq(moviePeople.movieId, movieId)).run();

    // Add actors
    for (const actor of nfoData.actors) {
      if (!actor.name) continue;

      // Jellyfin compat: import actor photos from local <thumb> paths
      if (library.jellyfinCompat && actor.thumb && !actor.thumb.startsWith("http")) {
        if (fs.existsSync(actor.thumb)) {
          const origExt = path.extname(actor.thumb) || ".jpg";
          const kubbyPhotoPath = getPersonPhotoPath(metadataDir, actor.name, origExt);
          if (!fs.existsSync(kubbyPhotoPath)) {
            try {
              fs.mkdirSync(path.dirname(kubbyPhotoPath), { recursive: true });
              fs.copyFileSync(actor.thumb, kubbyPhotoPath);
              console.log(`Imported actor photo for ${actor.name} from Jellyfin`);
            } catch (e) {
              console.warn(`Failed to import actor photo for ${actor.name}:`, e);
            }
          }
          actor.thumb = kubbyPhotoPath;
        }
      }

      const actorMtime = actor.thumb ? getFileMtime(actor.thumb) : null;
      const actorBlur = actor.thumb ? await generateBlurDataURL(actor.thumb) : null;
      const personId = getOrCreatePerson(actor.name, "actor", actor.thumb, actorMtime, actorBlur);
      db.insert(moviePeople)
        .values({
          id: uuidv4(),
          movieId,
          personId,
          role: actor.role || null,
          sortOrder: actor.order ?? null,
        })
        .run();
    }

    // Add directors
    for (const director of nfoData.directors) {
      if (!director) continue;
      const personId = getOrCreatePerson(director, "director");
      db.insert(moviePeople)
        .values({
          id: uuidv4(),
          movieId,
          personId,
          role: null,
          sortOrder: null,
        })
        .run();
    }

    scannedCount++;
  }

  // Update last scanned timestamp
  db.update(mediaLibraries)
    .set({ lastScannedAt: new Date().toISOString() })
    .where(eq(mediaLibraries.id, libraryId))
    .run();

  return { scannedCount };
}
