import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { auth } from "@/lib/auth";

// DELETE /api/users/[id] - Delete user (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Cannot delete yourself
  if (id === session.user.id) {
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
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { isAdmin, password } = body;

    // Toggle admin role
    if (typeof isAdmin === "boolean") {
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
