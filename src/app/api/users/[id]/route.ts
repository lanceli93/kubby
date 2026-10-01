import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count, and, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";

// DELETE /api/users/[id] - Delete user (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  // Cannot delete yourself
  if (id === guard.user.id) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  try {
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting last admin
    if (target.isAdmin) {
      const [{ total }] = db
        .select({ total: count() })
        .from(users)
        .where(eq(users.isAdmin, true))
        .all();
      if (total <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last administrator" },
          { status: 400 }
        );
      }
    }

    // CASCADE handles child tables
    db.delete(users).where(eq(users.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update user role/password (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  try {
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { isAdmin, password, displayName, username } = body;

    // Toggle admin role
    if (typeof isAdmin === "boolean") {
      // Cannot change your own role from this dialog (avoid locking yourself out)
      if (id === guard.user.id) {
        return NextResponse.json(
          { error: "You cannot change your own administrator status" },
          { status: 400 }
        );
      }
      // Prevent demoting last admin
      if (target.isAdmin && !isAdmin) {
        const [{ total }] = db
          .select({ total: count() })
          .from(users)
          .where(eq(users.isAdmin, true))
          .all();
        if (total <= 1) {
          return NextResponse.json(
            { error: "Cannot demote the last administrator" },
            { status: 400 }
          );
        }
      }
      db.update(users).set({ isAdmin }).where(eq(users.id, id)).run();
    }

    // Update display name
    if (typeof displayName === "string" || displayName === null) {
      db.update(users)
        .set({ displayName: displayName || null })
        .where(eq(users.id, id))
        .run();
    }

    // Update username (trimmed, non-empty, unique)
    if (typeof username === "string") {
      const trimmed = username.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Username cannot be empty" }, { status: 400 });
      }
      const existing = db
        .select()
        .from(users)
        .where(and(eq(users.username, trimmed), ne(users.id, id)))
        .get();
      if (existing) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      db.update(users).set({ username: trimmed }).where(eq(users.id, id)).run();
    }

    // Reset password
    if (typeof password === "string" && password.length > 0) {
      const passwordHash = await hash(password, 12);
      db.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
