import { db } from "@/lib/db";
import { users, mediaLibraries, settings } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import { serializeFolderPaths } from "@/lib/folder-paths";
import { validateApiKey } from "@/lib/tmdb";

export async function POST(request: Request) {
  // Only allow setup when no users exist
  const result = db.select({ count: count() }).from(users).get();
  if (result && result.count > 0) {
    return Response.json({ error: "Setup already completed" }, { status: 400 });
  }

  const body = await request.json();
  const { username, password, locale, libraryName, libraryType, folderPath, folderPaths, jellyfinCompat, scraperEnabled, tmdbApiKey } = body;

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  // Create admin user
  const passwordHash = await hash(password, 10);
  const userId = uuid();
  db.insert(users).values({
    id: userId,
    username,
    passwordHash,
    isAdmin: true,
    locale: locale || "en",
  }).run();

  // Optionally create media library and trigger scan
  // Support both folderPaths array (new) and single folderPath (backward compat)
  const paths: string[] = Array.isArray(folderPaths) && folderPaths.length > 0
    ? folderPaths
    : folderPath ? [folderPath] : [];

  // Save TMDB API key if provided
  if (tmdbApiKey && typeof tmdbApiKey === "string") {
    const trimmedKey = tmdbApiKey.trim();
    const valid = await validateApiKey(trimmedKey);
    if (valid) {
      const existing = db.select().from(settings).where(eq(settings.key, "tmdb_api_key")).get();
      if (existing) {
        db.update(settings).set({ value: trimmedKey }).where(eq(settings.key, "tmdb_api_key")).run();
      } else {
        db.insert(settings).values({ key: "tmdb_api_key", value: trimmedKey }).run();
      }
    }
  }

  let libraryId: string | null = null;
  if (libraryName && paths.length > 0) {
    // Allowlist the type (mirrors POST /api/libraries) so an unexpected
    // value can't land in the DB — this endpoint is reachable without auth
    // until the first user exists.
    const validTypes = ["movie", "tvshow", "photo", "music"];
    const finalType = validTypes.includes(libraryType) ? libraryType : "movie";
    // Photo and music libraries have no scraper/NFO/metadata-language concept —
    // force these off regardless of what the request body sent (same rule as
    // POST /api/libraries).
    const isMetadataless = finalType === "photo" || finalType === "music";

    libraryId = uuid();
    db.insert(mediaLibraries).values({
      id: libraryId,
      name: libraryName,
      type: finalType,
      folderPath: serializeFolderPaths(paths),
      scraperEnabled: isMetadataless ? false : !!scraperEnabled,
      jellyfinCompat: isMetadataless ? false : !!jellyfinCompat,
    }).run();
  }

  return Response.json({ success: true, libraryId });
}
