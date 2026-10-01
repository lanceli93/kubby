import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

// Server-side route guards. The JWT's isAdmin is frozen at sign-in, so a user
// demoted or deleted after logging in would keep their old powers if we trusted
// it — both guards re-read the user row from the DB instead.
//
// Usage in a route handler:
//   const guard = await requireAdmin();
//   if (guard instanceof NextResponse) return guard;
//   const { user } = guard;

type GuardUser = typeof users.$inferSelect;

export async function requireUser(): Promise<{ user: GuardUser } | NextResponse> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { user };
}

export async function requireAdmin(): Promise<{ user: GuardUser } | NextResponse> {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;
  if (!guard.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return guard;
}
