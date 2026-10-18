import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Change counters for in-memory caches (`data_versions` table). SQLite
 * triggers created in db/index.ts bump them on writes, so a cache keyed by a
 * counter is invalidated by ANY code path or connection that writes the
 * underlying tables.
 *
 *  - "cinema_library": movies / movie_people / people / media_libraries
 */
export type DataVersionName = "cinema_library";

/** Current value, or null when the table / row is missing (DB not migrated yet) — callers must then not cache. */
export function readDataVersion(name: DataVersionName): number | null {
  try {
    const r = db.get<{ version: number }>(sql`SELECT version FROM data_versions WHERE name = ${name}`);
    return r ? r.version : null;
  } catch {
    return null;
  }
}
