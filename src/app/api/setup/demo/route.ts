import { NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import fsPromises from "fs/promises";
import { db } from "@/lib/db";
import { users, settings, mediaLibraries } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { ensureDemoAssets } from "@/lib/demo/fetch-assets";
import { getDemoDir } from "@/lib/paths";
import { DELETE as deleteLibrary } from "@/app/api/libraries/[id]/route";

const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "demo";

function setSetting(key: string, value: string) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  else db.insert(settings).values({ key, value }).run();
}

// POST /api/setup/demo — seed the demo account + libraries, streaming SSE progress.
// Guarded by the same first-run check as normal setup (no users yet).
export async function POST() {
  const userCount = db.select({ count: count() }).from(users).get();
  if (userCount && userCount.count > 0) {
    return Response.json({ error: "Setup already completed" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        // Download the asset pack FIRST (before touching the DB) so a failed /
        // timed-out download leaves the install pristine — no orphan demo user
        // or half-created libraries to clean up. This warms the extract cache;
        // seedDemo's own ensureDemoAssets call then resolves it instantly.
        send({ phase: "download", current: 0, total: 0, title: "Downloading demo assets" });
        await ensureDemoAssets(({ receivedBytes, totalBytes }) =>
          send({ phase: "download", current: receivedBytes, total: totalBytes, title: "Downloading demo assets" }),
        );

        // Create the demo admin (known credentials, surfaced on the success screen).
        const userId = uuid();
        const passwordHash = await hash(DEMO_PASSWORD, 10);
        db.insert(users)
          .values({ id: userId, username: DEMO_USERNAME, passwordHash, isAdmin: true, locale: "en" })
          .run();
        setSetting("demo_user_id", userId);
        setSetting("demo_seeded_at", new Date().toISOString());

        await seedDemo((p) => send(p));

        send({ phase: "done", done: true, username: DEMO_USERNAME, password: DEMO_PASSWORD });
      } catch (error) {
        console.error("[demo seed] error:", error);
        send({ error: error instanceof Error ? error.message : "Demo setup failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

// DELETE /api/setup/demo?factoryReset=true — remove demo libraries (+ their
// on-disk artifacts), optionally the demo account. Keys off the isDemo
// allowlist so a real library added alongside the demo is never touched.
export async function DELETE(request: NextRequest) {
  const factoryReset = request.nextUrl.searchParams.get("factoryReset") === "true";
  try {
    const demoLibs = db
      .select({ id: mediaLibraries.id, type: mediaLibraries.type })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.isDemo, true))
      .all();

    // Reuse the real per-library teardown (FK cascade + per-domain on-disk
    // cleanup + orphan people/artist sweep) rather than duplicating it.
    for (const lib of demoLibs) {
      const url = `http://localhost/api/libraries/${lib.id}?cleanupOrphans=true`;
      await deleteLibrary(new NextRequest(url), { params: Promise.resolve({ id: lib.id }) });
    }

    // Remove the materialized demo media tree wholesale.
    await fsPromises.rm(getDemoDir(), { recursive: true, force: true }).catch(() => {});

    db.delete(settings).where(eq(settings.key, "demo_seeded_at")).run();

    if (factoryReset) {
      // Delete the demo user; its user-data rows cascade via FK. If this leaves
      // zero users, the app's count(users)===0 gate returns to the setup wizard.
      const demoUserId = db.select().from(settings).where(eq(settings.key, "demo_user_id")).get();
      if (demoUserId?.value) {
        db.delete(users).where(eq(users.id, demoUserId.value)).run();
      }
      db.delete(settings).where(eq(settings.key, "demo_user_id")).run();
    }

    return Response.json({ success: true, factoryReset, removed: demoLibs.length });
  } catch (error) {
    console.error("[demo clear] error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Demo clear failed" }, { status: 500 });
  }
}

// GET /api/setup/demo — status: whether demo data is present (for the dashboard panel).
export async function GET() {
  const demoLib = db
    .select({ id: mediaLibraries.id })
    .from(mediaLibraries)
    .where(eq(mediaLibraries.isDemo, true))
    .get();
  const seededAt = db.select().from(settings).where(eq(settings.key, "demo_seeded_at")).get();
  return Response.json({ hasDemo: !!demoLib, seededAt: seededAt?.value ?? null });
}
