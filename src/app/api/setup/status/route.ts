import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { count } from "drizzle-orm";

export async function GET() {
  const result = db.select({ count: count() }).from(users).get();
  return Response.json({ needsSetup: result?.count === 0 });
}
