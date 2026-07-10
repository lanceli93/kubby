/**
 * ambient-color — extract a cinema-safe "ambilight" tint from a movie's tiny
 * `posterBlur` data URL.
 *
 * The blur placeholders are minuscule, stable base64 JPEGs, so we decode each
 * into an <img>, draw it onto an 8x8 offscreen canvas (`willReadFrequently`),
 * average the pixels, then clamp saturation/lightness so the resulting glow
 * reads as a dim projector wash on the #0a0a0f background rather than a cheap
 * bright color cast (色光要压暗). Results are memoized — the same data URL
 * always yields the same color, and callers hammer this on every card hover.
 */

// Indigo primary (#6366f1) darkened toward the ambient base — the fallback used
// when a poster is basically grayscale (no meaningful hue to borrow).
const INDIGO_HUE = 239; // deg
const GRAYSCALE_S_THRESHOLD = 0.08;

// Cinema-safe clamp ranges (HSL, 0..1). Lifted from the original dim wash
// (S≤0.55 / L≤0.3) so the tint the spotlit poster casts onto the page actually
// reads as colored light instead of a barely-there smudge — still clamped well
// under fully-saturated/bright so it stays a projector glow, not a color cast.
const SAT_MIN = 0.3;
const SAT_MAX = 0.68;
const LIGHT_MIN = 0.2;
const LIGHT_MAX = 0.44;

// data URL → resolved RGB tuple (or null). Also holds in-flight promises so
// concurrent hovers over the same card share one decode.
const cache = new Map<string, Promise<[number, number, number] | null>>();

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** RGB (0..255) → HSL (h in 0..360, s/l in 0..1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

/** HSL (h in 0..360, s/l in 0..1) → RGB (0..255, rounded). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function decode(blurDataURL: string): Promise<[number, number, number] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
        }
        const rAvg = rSum / pixels;
        const gAvg = gSum / pixels;
        const bAvg = bSum / pixels;

        const [h, s, l] = rgbToHsl(rAvg, gAvg, bAvg);
        // Grayscale source → borrow the indigo brand hue so the glow still has
        // a cinematic tint instead of a muddy gray.
        if (s < GRAYSCALE_S_THRESHOLD) {
          resolve(hslToRgb(INDIGO_HUE, 0.4, 0.3));
          return;
        }
        const clampedS = clamp(s, SAT_MIN, SAT_MAX);
        const clampedL = clamp(l, LIGHT_MIN, LIGHT_MAX);
        resolve(hslToRgb(h, clampedS, clampedL));
      } catch {
        // Cross-origin taint or any canvas failure → no color.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = blurDataURL;
  });
}

/**
 * Extract a cinema-safe ambient RGB tuple from a poster blur placeholder.
 * Returns `null` on SSR, decode failure, or an unusable source.
 */
export function extractAmbientColor(
  blurDataURL: string
): Promise<[number, number, number] | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (!blurDataURL) return Promise.resolve(null);
  const cached = cache.get(blurDataURL);
  if (cached) return cached;
  const promise = decode(blurDataURL);
  cache.set(blurDataURL, promise);
  return promise;
}
