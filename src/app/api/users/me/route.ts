import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth-guard";

// GET /api/users/me - Get current user profile
export async function GET() {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  const user = db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    isAdmin: users.isAdmin,
    locale: users.locale,
  }).from(users).where(eq(users.id, guard.user.id)).get();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

// PUT /api/users/me - Update current user profile
export async function PUT(request: NextRequest) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await request.json();
    const { displayName, locale } = body;

    const updates: Record<string, string | null> = {};
    if (displayName !== undefined) updates.displayName = displayName || null;
    if (locale !== undefined) updates.locale = locale;

    db.update(users)
      .set(updates)
      .where(eq(users.id, guard.user.id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
