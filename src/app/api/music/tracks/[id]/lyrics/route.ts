import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { musicTracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveTrackLyrics, isSyncedLyrics } from "@/lib/music/lyrics";

// GET /api/music/tracks/[id]/lyrics
// Returns { lyrics: string | null, synced: boolean }.
// `music_tracks.lyrics` is populated by the scanner, but libraries scanned
// before lyrics support have a NULL column — so on the first request we parse
// the file on-demand and cache the result back (empty string = "checked, none"
// so we never re-parse a lyric-less track).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const track = db
      .select({ lyrics: musicTracks.lyrics, filePath: musicTracks.filePath })
      .from(musicTracks)
      .where(eq(musicTracks.id, id))
      .get();

    if (!track) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Already resolved (non-null): "" means checked-and-empty.
    if (track.lyrics != null) {
      const text = track.lyrics.trim();
      return NextResponse.json({
        lyrics: text || null,
        synced: text ? isSyncedLyrics(text) : false,
      });
    }

    // Back-fill: parse the file once, cache the outcome.
    let resolved: string | null = null;
    if (fs.existsSync(track.filePath)) {
      resolved = await resolveTrackLyrics(track.filePath);
    }
    db.update(musicTracks)
      .set({ lyrics: resolved ?? "" })
      .where(eq(musicTracks.id, id))
      .run();

    return NextResponse.json({
      lyrics: resolved,
      synced: resolved ? isSyncedLyrics(resolved) : false,
    });
  } catch (error) {
    console.error("Get track lyrics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
