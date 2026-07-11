import fs from "fs";
import path from "path";
import { parseFile, type IAudioMetadata } from "music-metadata";

/**
 * Lyrics extraction for the music domain.
 *
 * A track's lyrics can come from three places, in priority order:
 *   1. A `.lrc` sidecar file next to the audio (synced, timestamped) — the
 *      de-facto standard for downloaded lyrics.
 *   2. Embedded tags parsed by `music-metadata` (`common.lyrics`): ID3v2
 *      `SYLT`/`USLT`, FLAC/Vorbis `LYRICS`/`UNSYNCEDLYRICS`, MP4 `©lyr`, …
 *      Synced entries are re-serialised to LRC so the player can highlight
 *      lines; unsynced entries are stored as plain text.
 *
 * The result is a single string stored inline on `music_tracks.lyrics`. If it
 * begins with an LRC timestamp (`[mm:ss.xx]`) the UI treats it as synced.
 */

/** True when the text carries at least one LRC timestamp tag `[mm:ss(.xx)]`. */
export function isSyncedLyrics(text: string): boolean {
  return /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/.test(text);
}

/** Format milliseconds as an LRC timestamp `[mm:ss.xx]`. */
function msToLrcStamp(ms: number): string {
  const totalCs = Math.max(0, Math.round(ms / 10)); // centiseconds
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `[${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
}

/**
 * Turn `music-metadata`'s `common.lyrics` into a single lyrics string, or null.
 * Prefers a synced entry (rendered to LRC); otherwise the first non-empty
 * plain-text entry.
 */
export function extractLyricsFromCommon(common: IAudioMetadata["common"]): string | null {
  const tags = common.lyrics;
  if (!Array.isArray(tags) || tags.length === 0) return null;

  // Prefer a synchronised entry — build an LRC document from its timed lines.
  for (const tag of tags) {
    const sync = tag.syncText;
    if (Array.isArray(sync) && sync.length > 0 && sync.some((s) => typeof s.timestamp === "number")) {
      const lines = sync
        .filter((s) => s.text != null)
        .map((s) =>
          typeof s.timestamp === "number"
            ? `${msToLrcStamp(s.timestamp)}${s.text}`
            : s.text
        );
      const doc = lines.join("\n").trim();
      if (doc) return doc;
    }
  }

  // Fall back to the first plain-text block.
  for (const tag of tags) {
    if (tag.text && tag.text.trim()) return tag.text.trim();
  }
  return null;
}

/**
 * Look for a `.lrc` sidecar next to the audio file (same basename). Returns its
 * text content, or null. Case-insensitive on the extension only.
 */
export function readLrcSidecar(audioPath: string): string | null {
  const dir = path.dirname(audioPath);
  const base = path.basename(audioPath, path.extname(audioPath));
  for (const ext of [".lrc", ".LRC"]) {
    const candidate = path.join(dir, base + ext);
    try {
      if (fs.existsSync(candidate)) {
        const text = fs.readFileSync(candidate, "utf8").trim();
        if (text) return text;
      }
    } catch {
      // ignore unreadable sidecar
    }
  }
  return null;
}

/**
 * Resolve lyrics for a track: `.lrc` sidecar first (synced, authoritative),
 * then embedded tags. `common` may be supplied when the caller already parsed
 * the file (scanner); otherwise the file is parsed here (on-demand API).
 * Returns null when the track has no lyrics anywhere.
 */
export async function resolveTrackLyrics(
  audioPath: string,
  common?: IAudioMetadata["common"],
): Promise<string | null> {
  const sidecar = readLrcSidecar(audioPath);
  if (sidecar) return sidecar;

  let tags = common;
  if (!tags) {
    try {
      const md = await parseFile(audioPath, { duration: false });
      tags = md.common;
    } catch {
      return null;
    }
  }
  return extractLyricsFromCommon(tags);
}
