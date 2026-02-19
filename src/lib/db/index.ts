import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "kubby.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-apply schema migrations
const pending = [
  // 0003: people metadata columns
  "ALTER TABLE `people` ADD `overview` text",
  "ALTER TABLE `people` ADD `birth_date` text",
  "ALTER TABLE `people` ADD `birth_year` integer",
  "ALTER TABLE `people` ADD `place_of_birth` text",
  "ALTER TABLE `people` ADD `death_date` text",
  "ALTER TABLE `people` ADD `imdb_id` text",
  "ALTER TABLE `people` ADD `date_added` text NOT NULL DEFAULT (datetime('now'))",
  // 0004: resolution badge preference
  "ALTER TABLE `user_preferences` ADD `show_resolution_badge` integer NOT NULL DEFAULT 1",
];
for (const sql of pending) {
  try { sqlite.exec(sql); } catch { /* column already exists */ }
}

export const db = drizzle(sqlite, { schema });
