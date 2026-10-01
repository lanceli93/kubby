import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";

// POST /api/users - Register a new user
// First user (setup flow): no auth required, becomes admin
// After setup: admin-only
export async function POST(request: NextRequest) {
  try {
    const [{ total }] = db.select({ total: count() }).from(users).all();

    // After first user exists, require admin auth
    if (total > 0) {
      const guard = await requireAdmin();
      if (guard instanceof NextResponse) return guard;
    }

    const body = await request.json();
    const { password, displayName, isAdmin: requestedAdmin } = body;
    const username = typeof body.username === "string" ? body.username.trim() : body.username;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Check if username is taken
    const existing = db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (existing) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }

    // First user becomes admin; subsequent users get admin status from request
    const isAdmin = total === 0 ? true : !!requestedAdmin;

    const passwordHash = await hash(password, 12);
    const id = uuidv4();

    db.insert(users)
      .values({
        id,
        username,
        passwordHash,
        displayName: displayName || null,
        isAdmin,
      })
      .run();

    return NextResponse.json({ id, username, isAdmin }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/users - List all users (admin only)
export async function GET() {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    const allUsers = db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .all();

    return NextResponse.json(allUsers);
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
