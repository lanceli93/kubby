import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SetupWizard } from "./setup-wizard";

export default function SetupPage() {
  const result = db.select({ count: count() }).from(users).get();
  if (result && result.count > 0) {
    redirect("/");
  }
  return <SetupWizard />;
}
