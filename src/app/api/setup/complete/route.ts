import { db } from "@/lib/db";
import { users, mediaLibraries } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import { serializeFolderPaths } from "@/lib/folder-paths";

export async function POST(request: Request) {
  // Only allow setup when no users exist
  const result = db.select({ count: count() }).from(users).get();
  if (result && result.count > 0) {
    return Response.json({ error: "Setup already completed" }, { status: 400 });
  }

  const body = await request.json();
  console.log("[setup/complete] body:", JSON.stringify(body));
  const { username, password, locale, libraryName, libraryType, folderPath, folderPaths, jellyfinCompat } = body;

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

  let libraryId: string | null = null;
  if (libraryName && paths.length > 0) {
    libraryId = uuid();
    db.insert(mediaLibraries).values({
      id: libraryId,
      name: libraryName,
      type: libraryType || "movie",
      folderPath: serializeFolderPaths(paths),
      jellyfinCompat: jellyfinCompat ? true : false,
    }).run();
    // Scan is NOT triggered here — the homepage auto-scans unscanned libraries
    // via SSE so the user can see progress in the global scan bar.
  }

  return Response.json({ success: true, libraryId });
}
