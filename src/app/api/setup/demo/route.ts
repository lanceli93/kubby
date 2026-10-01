import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, ne } from "drizzle-orm";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import fsPromises from "fs/promises";
import { db } from "@/lib/db";
import { users, settings, mediaLibraries } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { ensureDemoAssets } from "@/lib/demo/fetch-assets";
import { getDemoDir } from "@/lib/paths";
import { deleteLibraryById } from "@/lib/library-teardown";
import { requireAdmin, requireUser } from "@/lib/auth-guard";

const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "demo";

function setSetting(key: string, value: string) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  else db.insert(settings).values({ key, value }).run();
}

function getSetting(key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

// The demo account, if its id is recorded AND the user still exists (an admin
// may have deleted it from the Users page, leaving a stale setting behind).
function getDemoUser() {
  const id = getSetting("demo_user_id");
  if (!id) return null;
  return db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, id)).get() ?? null;
}

// Facts the UI needs to decide which demo actions are allowed. demoIsLastAdmin:
// removing the demo account would leave the remaining users with no admin
// (only meaningful when other users exist — with zero left, setup reopens).
function getDemoAccountFacts(demoUser: { id: string; isAdmin: boolean } | null) {
  if (!demoUser) return { otherUserCount: countUsers(), demoIsLastAdmin: false };
  const otherUserCount = db.select({ n: count() }).from(users).where(ne(users.id, demoUser.id)).get()?.n ?? 0;
  const otherAdminCount =
    db.select({ n: count() }).from(users).where(and(ne(users.id, demoUser.id), eq(users.isAdmin, true))).get()?.n ?? 0;
  return { otherUserCount, demoIsLastAdmin: demoUser.isAdmin && otherUserCount > 0 && otherAdminCount === 0 };
}

function countUsers(): number {
  return db.select({ n: count() }).from(users).get()?.n ?? 0;
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
        const locale = "en";
        const passwordHash = await hash(DEMO_PASSWORD, 10);
        db.insert(users)
          .values({ id: userId, username: DEMO_USERNAME, passwordHash, isAdmin: true, locale })
          .run();
        setSetting("demo_user_id", userId);
        setSetting("demo_seeded_at", new Date().toISOString());

        // Pass the demo user's id + locale so seedDemo can seed that account's
        // rating dimensions, movie/actor ratings, and basic actor bios.
        await seedDemo((p) => send(p), userId, locale);

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

type DemoScope = "libraries" | "account" | "all";

// DELETE /api/setup/demo?scope=libraries|account|all — admin only.
//   libraries (default): remove the demo libraries (+ their on-disk artifacts).
//                        Keys off the isDemo allowlist so a real library added
//                        alongside the demo is never touched.
//   account:             remove the demo account (refused if it's you or it's
//                        the last admin while other users remain).
//   all:                 factory reset — both of the above. Setup only reopens
//                        if no users are left; other accounts are kept.
// `?factoryReset=true` is accepted as a legacy alias for scope=all.
// Responds { success, scope, removed, removedDemoUser, removedCurrentUser, usersRemaining }.
export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { user: currentUser } = guard;

  const params = request.nextUrl.searchParams;
  const rawScope = params.get("factoryReset") === "true" ? "all" : (params.get("scope") ?? "libraries");
  if (rawScope !== "libraries" && rawScope !== "account" && rawScope !== "all") {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }
  const scope = rawScope as DemoScope;
  const removeAccount = scope === "account" || scope === "all";
  const removeLibraries = scope === "libraries" || scope === "all";

  const demoUser = removeAccount ? getDemoUser() : null;

  // Check preconditions BEFORE touching anything so a refused request has no
  // side effects (e.g. libraries deleted but the account kept).
  if (removeAccount && demoUser) {
    // Removing yourself only makes sense as part of a factory reset (which then
    // signs you out); the standalone action would orphan your own session.
    if (scope === "account" && demoUser.id === currentUser.id) {
      return NextResponse.json({ error: "Cannot remove the account you're signed in with", reason: "self" }, { status: 400 });
    }
    if (getDemoAccountFacts(demoUser).demoIsLastAdmin) {
      return NextResponse.json(
        { error: "Removing the demo account would leave no administrator", reason: "lastAdmin" },
        { status: 400 },
      );
    }
  }

  try {
    let removed = 0;
    if (removeLibraries) {
      const demoLibs = db
        .select({ id: mediaLibraries.id })
        .from(mediaLibraries)
        .where(eq(mediaLibraries.isDemo, true))
        .all();

      // Reuse the real per-library teardown (FK cascade + per-domain on-disk
      // cleanup + orphan people/artist sweep) rather than duplicating it.
      for (const lib of demoLibs) {
        if (await deleteLibraryById(lib.id, { cleanupOrphans: true })) removed++;
      }

      // Remove the materialized demo media tree wholesale.
      await fsPromises.rm(getDemoDir(), { recursive: true, force: true }).catch(() => {});

      db.delete(settings).where(eq(settings.key, "demo_seeded_at")).run();
    }

    let removedDemoUser = false;
    if (removeAccount) {
      // Delete the demo user; its user-data rows cascade via FK. If this leaves
      // zero users, the app's count(users)===0 gate returns to the setup wizard.
      if (demoUser) {
        db.delete(users).where(eq(users.id, demoUser.id)).run();
        removedDemoUser = true;
      }
      db.delete(settings).where(eq(settings.key, "demo_user_id")).run();
    }

    return NextResponse.json({
      success: true,
      scope,
      removed,
      removedDemoUser,
      removedCurrentUser: removedDemoUser && demoUser?.id === currentUser.id,
      usersRemaining: countUsers(),
    });
  } catch (error) {
    console.error("[demo clear] error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demo clear failed" }, { status: 500 });
  }
}

// GET /api/setup/demo — status for the dashboard Demo Data panel + header badge.
// Public callers only learn whether demo libraries exist; the account details
// (which would advertise a known-credential admin) are reserved for admins.
export async function GET() {
  const demoLib = db
    .select({ id: mediaLibraries.id })
    .from(mediaLibraries)
    .where(eq(mediaLibraries.isDemo, true))
    .get();
  const hasDemo = !!demoLib;

  const guard = await requireUser();
  if (guard instanceof NextResponse || !guard.user.isAdmin) {
    return NextResponse.json({ hasDemo });
  }

  const demoUser = getDemoUser();
  const { otherUserCount, demoIsLastAdmin } = getDemoAccountFacts(demoUser);
  return NextResponse.json({
    hasDemo,
    hasDemoUser: !!demoUser,
    seededAt: getSetting("demo_seeded_at"),
    isCurrentUserDemo: !!demoUser && demoUser.id === guard.user.id,
    demoIsLastAdmin,
    // Accounts that survive a factory reset (everyone but the demo user).
    otherUserCount,
  });
}
