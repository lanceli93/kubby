/**
 * Resolve the demo asset bundle, downloading it on demand.
 *
 * Demo Mode's media pack is NOT bundled into the installer (it would bloat every
 * download for a feature most users skip). Instead it lives as a single
 * `demo-assets.tar.gz` attached to a GitHub release; when a user opts into demo
 * mode we fetch it, extract it into the data dir, and seed from there.
 *
 * Resolution order (first hit wins):
 *   1. A local committed tree — `getDemoAssetsDir()` (dev boxes; contains
 *      manifest.json). No network needed.
 *   2. A previously-extracted download cache — `getDemoAssetsCacheDir()`.
 *   3. Download the release tarball, verify + extract into the cache dir.
 *
 * The download is bounded by BOTH an overall deadline and a per-chunk stall
 * timeout, so a hung/half-open connection fails fast with a clear error rather
 * than blocking setup forever.
 */
import fs from "fs";
import path from "path";
import { getDemoAssetsDir, getDemoAssetsCacheDir } from "@/lib/paths";
import { extractTarGz } from "./targz";

/**
 * Default location of the release asset. Pinned to a specific release tag on
 * purpose: release assets persist, so LATER app versions keep resolving this
 * same file and never need to re-ship the pack. Bump this only when the pack
 * content actually changes (upload to the then-current release + update here).
 * Overridable for forks / mirrors via KUBBY_DEMO_ASSETS_URL.
 */
export const DEMO_ASSETS_URL =
  process.env.KUBBY_DEMO_ASSETS_URL ||
  "https://github.com/lanceli93/kubby/releases/download/v0.7.1/demo-assets.tar.gz";

// The pack is ~40 MB, so the overall ceiling is generous; the stall guard is
// what actually catches a hung/half-open connection quickly.
const OVERALL_TIMEOUT_MS = Number(process.env.KUBBY_DEMO_DOWNLOAD_TIMEOUT_MS) || 120_000;
const STALL_TIMEOUT_MS = 20_000; // no bytes for this long → give up

export type DownloadProgress = { receivedBytes: number; totalBytes: number };

/** True when a dir has a manifest.json — our marker for a usable asset tree. */
function hasManifest(dir: string): boolean {
  return fs.existsSync(path.join(dir, "manifest.json"));
}

/**
 * Ensure the demo asset tree exists and return its absolute path. Downloads the
 * release tarball if no local/cached copy is present. `onProgress` reports
 * download bytes (only fired during an actual download).
 */
export async function ensureDemoAssets(
  onProgress: (p: DownloadProgress) => void = () => {},
): Promise<string> {
  // 1. Committed dev tree.
  const local = getDemoAssetsDir();
  if (hasManifest(local)) return local;

  // 2. Prior download.
  const cache = getDemoAssetsCacheDir();
  if (hasManifest(cache)) return cache;

  // 3. Download + extract.
  const buffer = await downloadWithTimeout(DEMO_ASSETS_URL, onProgress);

  // Extract into a temp sibling, then swap in — so an interrupted extract never
  // leaves a half-populated cache dir that hasManifest() would wrongly accept.
  const tmp = `${cache}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    extractTarGz(buffer, tmp);
    if (!hasManifest(tmp)) {
      throw new Error("Downloaded demo pack is missing manifest.json (corrupt or wrong asset).");
    }
    fs.rmSync(cache, { recursive: true, force: true });
    fs.renameSync(tmp, cache);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return cache;
}

/**
 * Download a URL into memory with an overall deadline + a per-chunk stall guard.
 * Throws a user-facing message on timeout / HTTP error / network failure.
 */
async function downloadWithTimeout(
  url: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<Buffer> {
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS);
  let stall = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);

  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Download failed: server returned ${res.status} ${res.statusText}.`);
    }
    if (!res.body) throw new Error("Download failed: empty response body.");

    const totalBytes = Number(res.headers.get("content-length")) || 0;
    const chunks: Uint8Array[] = [];
    let received = 0;

    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        // Reset the stall timer on every chunk; overall deadline still applies.
        clearTimeout(stall);
        stall = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
        onProgress({ receivedBytes: received, totalBytes });
      }
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Download timed out after ${Math.round(OVERALL_TIMEOUT_MS / 1000)}s. ` +
          "Check your internet connection and try again.",
      );
    }
    if (err instanceof Error) {
      throw new Error(`Could not download demo assets: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(overall);
    clearTimeout(stall);
  }
}
