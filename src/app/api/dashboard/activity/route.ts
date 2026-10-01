import { NextResponse } from "next/server";
import { desc, isNotNull, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { mediaLibraries, movies, tvShows, photoItems, musicAlbums, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-guard";

// GET /api/dashboard/activity — admin-only recent-activity feed. There is no
// activity-log table; the feed is derived from timestamps the domain tables
// already carry. Rows are structured (kind + params) so the client localizes
// the message. Bulk adds are grouped per library per (UTC) day, so a scan that
// added 30 movies is one row, not 30.

type ActivityKind =
  | "libraryCreated"
  | "libraryScanned"
  | "moviesAdded"
  | "tvShowsAdded"
  | "photosAdded"
  | "albumsAdded"
  | "userCreated";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Item title when a group holds exactly one item; username for userCreated. */
  name: string | null;
  /** Library name for library / bulk-add kinds. */
  library: string | null;
  count: number;
  /** ISO-8601 UTC. */
  timestamp: string;
}

const LIMIT = 15;

// Timestamps come in two shapes: SQLite datetime('now') defaults ("YYYY-MM-DD
// HH:MM:SS", UTC, no zone) and JS toISOString() writes (scanners). Normalize
// both to ISO UTC.
function toIso(raw: string): string {
  const s = raw.includes("T") ? raw : raw.replace(" ", "T");
  return /(Z|[+-]\d\d:\d\d)$/.test(s) ? s : `${s}Z`;
}

// One domain table → grouped "N added to <library>" rows. All four tables are
// single-domain, so a row's library is always of that domain's type.
function groupedAdds(
  kind: ActivityKind,
  libraryCol: SQLiteColumn,
  dateCol: SQLiteColumn,
  nameCol: SQLiteColumn,
  table: SQLiteTable,
  libraryNames: Map<string, string>,
): ActivityItem[] {
  // substr(…, 1, 10) is the UTC calendar day in both timestamp shapes.
  const day: SQL<string> = sql<string>`substr(${dateCol}, 1, 10)`;
  const latest = sql<string>`max(${dateCol})`;
  const rows = db
    .select({
      libraryId: sql<string>`${libraryCol}`,
      day,
      n: sql<number>`count(*)`,
      latest,
      sample: sql<string>`min(${nameCol})`,
    })
    .from(table)
    .groupBy(libraryCol, day)
    .orderBy(desc(latest))
    .limit(LIMIT)
    .all();
  return rows.map((r) => ({
    id: `${kind}:${r.libraryId}:${r.day}`,
    kind,
    name: r.n === 1 ? r.sample : null,
    library: libraryNames.get(r.libraryId) ?? null,
    count: r.n,
    timestamp: toIso(r.latest),
  }));
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  try {
    const libs = db
      .select({
        id: mediaLibraries.id,
        name: mediaLibraries.name,
        createdAt: mediaLibraries.createdAt,
        lastScannedAt: mediaLibraries.lastScannedAt,
      })
      .from(mediaLibraries)
      .all();
    const libraryNames = new Map(libs.map((l) => [l.id, l.name]));

    const items: ActivityItem[] = [];

    for (const lib of libs) {
      items.push({
        id: `libraryCreated:${lib.id}`,
        kind: "libraryCreated",
        name: null,
        library: lib.name,
        count: 0,
        timestamp: toIso(lib.createdAt),
      });
      if (lib.lastScannedAt) {
        items.push({
          id: `libraryScanned:${lib.id}`,
          kind: "libraryScanned",
          name: null,
          library: lib.name,
          count: 0,
          timestamp: toIso(lib.lastScannedAt),
        });
      }
    }

    items.push(
      ...groupedAdds("moviesAdded", movies.mediaLibraryId, movies.dateAdded, movies.title, movies, libraryNames),
      ...groupedAdds("tvShowsAdded", tvShows.mediaLibraryId, tvShows.dateAdded, tvShows.title, tvShows, libraryNames),
      ...groupedAdds("photosAdded", photoItems.libraryId, photoItems.dateAdded, photoItems.fileName, photoItems, libraryNames),
      ...groupedAdds("albumsAdded", musicAlbums.libraryId, musicAlbums.dateAdded, musicAlbums.title, musicAlbums, libraryNames),
    );

    for (const u of db
      .select({ id: users.id, username: users.username, displayName: users.displayName, createdAt: users.createdAt })
      .from(users)
      .where(isNotNull(users.createdAt))
      .orderBy(desc(users.createdAt))
      .limit(LIMIT)
      .all()) {
      items.push({
        id: `userCreated:${u.id}`,
        kind: "userCreated",
        name: u.displayName || u.username,
        library: null,
        count: 0,
        timestamp: toIso(u.createdAt),
      });
    }

    items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return NextResponse.json(items.slice(0, LIMIT));
  } catch (error) {
    console.error("Dashboard activity error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
