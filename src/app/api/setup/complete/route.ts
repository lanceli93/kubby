import { db } from "@/lib/db";
import { users, mediaLibraries } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import { scanLibrary } from "@/lib/scanner";
import { serializeFolderPaths } from "@/lib/folder-paths";

export async function POST(request: Request) {
  // Only allow setup when no users exist
  const result = db.select({ count: count() }).from(users).get();
  if (result && result.count > 0) {
    return Response.json({ error: "Setup already completed" }, { status: 400 });
  }

  const body = await request.json();
  const { username, password, locale, libraryName, folderPath } = body;

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
  if (libraryName && folderPath) {
    const libraryId = uuid();
    db.insert(mediaLibraries).values({
      id: libraryId,
      name: libraryName,
      type: "movie",
      folderPath: serializeFolderPaths([folderPath]),
    }).run();

    // Scan in background, don't block the response
    scanLibrary(libraryId).catch((err) =>
      console.error("Initial library scan failed:", err)
    );
  }

  return Response.json({ success: true });
}
