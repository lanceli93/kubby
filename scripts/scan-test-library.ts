/**
 * Standalone scan+scrape driver for the test library.
 *
 * Runs the real scanLibrary() outside the dev server so the TMDB proxy env
 * is guaranteed active. Every bare folder gets scraped (poster + NFO +
 * cast) on this pass.
 *
 * Usage (proxy required in CN to reach TMDB):
 *   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 \
 *     HTTP_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1 \
 *     npx tsx scripts/scan-test-library.ts
 */
import { db } from "@/lib/db";
import { mediaLibraries } from "@/lib/db/schema";
import { scanLibrary } from "@/lib/scanner";

async function main() {
  const libs = db.select().from(mediaLibraries).all();
  if (libs.length === 0) {
    console.error("No media libraries found in DB.");
    process.exit(1);
  }
  const lib = libs.find((l) => l.type === "movie") ?? libs[0];
  console.log(`Scanning library: ${lib.name} (${lib.id})`);
  console.log(`  scraperEnabled=${lib.scraperEnabled} jellyfinCompat=${lib.jellyfinCompat}`);

  const result = await scanLibrary(lib.id, (p) => {
    process.stdout.write(`\r[${p.current}/${p.total}] ${p.title.padEnd(50).slice(0, 50)}`);
  });

  console.log("\n\n--- Scan complete ---");
  console.log(`  Scanned: ${result.scannedCount}`);
  console.log(`  Removed: ${result.removedCount}`);
  console.log(`  Skipped: ${result.skipped.length}`);
  for (const s of result.skipped) {
    console.log(`    - ${s.name}: ${s.reason}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("\nScan failed:", e);
  process.exit(1);
});
