import { execFile } from "child_process";

// Keyframe timestamp index for direct-play seek snapping.
// Precise seeks force the browser to decode every frame from the previous
// keyframe — for 8K HEVC with 6s GOPs that's 2-3s per seek. Snapping the
// seek target to a keyframe makes the browser decode a single frame instead.
// The scan is demux-only (no decoding): ~1.7s for a 900MB file, I/O bound.

interface KeyframeCacheGlobal {
  __kubbyKeyframeCache?: Map<string, Promise<number[] | null>>;
}

function getCache(): Map<string, Promise<number[] | null>> {
  const g = globalThis as KeyframeCacheGlobal;
  if (!g.__kubbyKeyframeCache) {
    g.__kubbyKeyframeCache = new Map();
  }
  return g.__kubbyKeyframeCache;
}

function scanKeyframes(filePath: string): Promise<number[] | null> {
  const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
  return new Promise((resolve) => {
    try {
      execFile(
        ffprobePath,
        [
          "-v", "error",
          "-select_streams", "v:0",
          "-show_entries", "packet=pts_time,flags",
          "-of", "csv=p=0",
          filePath,
        ],
        { timeout: 180000, maxBuffer: 256 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            console.warn(`[keyframes] ffprobe failed for ${filePath}:`, error.message);
            resolve(null);
            return;
          }
          const keyframes: number[] = [];
          for (const line of stdout.split("\n")) {
            const comma = line.indexOf(",");
            if (comma === -1 || line[comma + 1] !== "K") continue;
            const pts = parseFloat(line.slice(0, comma));
            if (!isNaN(pts)) keyframes.push(pts);
          }
          keyframes.sort((a, b) => a - b);
          resolve(keyframes.length > 0 ? keyframes : null);
        }
      );
    } catch (err) {
      console.warn(`[keyframes] ffprobe spawn failed:`, (err as Error).message);
      resolve(null);
    }
  });
}

export function getKeyframeIndex(filePath: string): Promise<number[] | null> {
  const cache = getCache();
  let promise = cache.get(filePath);
  if (!promise) {
    promise = scanKeyframes(filePath);
    cache.set(filePath, promise);
    // Drop failed scans so a transient error doesn't poison the cache
    promise.then((result) => {
      if (!result) cache.delete(filePath);
    });
  }
  return promise;
}
