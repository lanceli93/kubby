/**
 * Standalone script to enrich NFO files with actor data from TMDb.
 *
 * Usage:
 *   TMDB_API_KEY=xxx npx tsx scripts/enrich-nfo.ts <media-library-path>
 *   TMDB_API_KEY=xxx npx tsx scripts/enrich-nfo.ts --force <media-library-path>
 *
 * Options:
 *   --force   Strip existing <actor> elements and re-fetch from TMDb
 *
 * Photos stored at: data/metadata/people/{FirstLetter}/{Name}/photo.jpg
 *
 * After running, rescan your library in Kubby to import the actor data.
 */

import fs from "fs";
import path from "path";
import { parseNfo } from "../src/lib/scanner/nfo-parser";
import {
  fetchMovieCredits,
  getImageUrl,
  downloadImage,
  getPersonPhotoPath,
} from "../src/lib/tmdb";
import {
  writeActorsToNfo,
  stripActorsFromNfo,
  type NfoActorEntry,
} from "../src/lib/scanner/nfo-writer";

const TMDB_API_KEY = process.env.TMDB_API_KEY as string;
const MAX_ACTORS = 20;
const METADATA_DIR = path.resolve(process.env.KUBBY_DATA_DIR || path.join(process.cwd(), "data"), "metadata/people");

const args = process.argv.slice(2);
const force = args.includes("--force");
const targetDir = args.find((a) => !a.startsWith("--"));

if (!targetDir) {
  console.error(
    "Usage: TMDB_API_KEY=xxx npx tsx scripts/enrich-nfo.ts [--force] <media-library-path>"
  );
  process.exit(1);
}

if (!TMDB_API_KEY) {
  console.error("Error: TMDB_API_KEY environment variable is required");
  console.error(
    "Get your API key from https://www.themoviedb.org/settings/api"
  );
  process.exit(1);
}

const resolvedDir = path.resolve(targetDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Error: Directory not found: ${resolvedDir}`);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\nEnriching NFO files in: ${resolvedDir}`);
  console.log(`Metadata directory: ${METADATA_DIR}`);
  if (force) console.log(`Mode: --force (re-fetch all)`);
  console.log();

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  let processed = 0;
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const movieDir = path.join(resolvedDir, entry.name);
    const nfoPath = path.join(movieDir, "movie.nfo");

    if (!fs.existsSync(nfoPath)) continue;

    processed++;

    let nfoData;
    try {
      nfoData = parseNfo(fs.readFileSync(nfoPath, "utf-8"));
    } catch (e) {
      console.error(`  ✗ Failed to parse: ${nfoPath}`, e);
      errors++;
      continue;
    }

    const title = nfoData.title || entry.name;

    if (nfoData.actors.length > 0 && !force) {
      console.log(
        `  ○ ${title} — already has ${nfoData.actors.length} actors, skipping`
      );
      skipped++;
      continue;
    }

    if (!nfoData.tmdbId) {
      console.log(`  ○ ${title} — no tmdbId, skipping`);
      skipped++;
      continue;
    }

    // In force mode, strip existing actors before re-writing
    if (force && nfoData.actors.length > 0) {
      stripActorsFromNfo(nfoPath);
      console.log(`  → ${title} (tmdb: ${nfoData.tmdbId}) [force re-fetch]`);
    } else {
      console.log(`  → ${title} (tmdb: ${nfoData.tmdbId})`);
    }

    try {
      const credits = await fetchMovieCredits(nfoData.tmdbId, TMDB_API_KEY);
      const castMembers = credits.cast.slice(0, MAX_ACTORS);

      if (castMembers.length === 0) {
        console.log(`    No cast found on TMDb`);
        skipped++;
        continue;
      }

      const actorEntries: NfoActorEntry[] = [];

      for (const member of castMembers) {
        let thumbPath: string | undefined;

        if (member.profile_path) {
          const photoFile = getPersonPhotoPath(METADATA_DIR, member.name);

          try {
            const downloaded = await downloadImage(
              getImageUrl(member.profile_path),
              photoFile
            );
            if (downloaded) {
              console.log(`    ↓ Downloaded photo: ${member.name}`);
            }
            thumbPath = photoFile;
          } catch (e) {
            console.error(
              `    ✗ Photo download failed for ${member.name}:`,
              e
            );
          }
        }

        actorEntries.push({
          name: member.name,
          role: member.character || "",
          thumb: thumbPath,
          order: member.order,
        });
      }

      writeActorsToNfo(nfoPath, actorEntries);
      console.log(`    ✓ Wrote ${actorEntries.length} actors to NFO`);
      enriched++;

      // Rate limit: ~250ms between TMDb API calls
      await sleep(250);
    } catch (e) {
      console.error(`    ✗ Failed to enrich ${title}:`, e);
      errors++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Total NFOs found: ${processed}`);
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(
    `\nDone! Now rescan your library in Kubby to import the actor data.`
  );
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
