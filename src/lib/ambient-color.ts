/**
 * ambient-color — extract a cinema-safe "ambilight" tint from a movie's tiny
 * `posterBlur` data URL.
 *
 * The blur placeholders are minuscule, stable base64 JPEGs, so we decode each
 * into an <img>, draw it onto an 8x8 offscreen canvas (`willReadFrequently`),
 * average the pixels, then clamp perceptual lightness/chroma (OKLCH) so the glow
 * reads as a dim projector wash on the #0a0a0f background rather than a cheap
 * bright color cast (色光要压暗). Results are memoized — the same data URL
 * always yields the same color, and callers hammer this on every card hover.
 */

// Fallback used when a poster is basically grayscale (no meaningful hue to
// borrow): the indigo primary (#6366f1) hue, dimmed toward the ambient base.
const INDIGO_HUE = 277; // deg, OKLCH hue of #6366f1
const GRAYSCALE_C_THRESHOLD = 0.02;

// Cinema-safe clamp ranges in OKLCH (perceptual). Clamping in HSL let warm hues
// (yellow/orange/green) come out far brighter than blue/purple at the same "L",
// so some posters washed the whole page. OKLCH L is perceived lightness, so every
// poster now casts a glow of the same strength — only the hue differs. Sits
// between the original dim wash and the over-bright 2fe0dd5 boost.
const L_MIN = 0.32;
const L_MAX = 0.48;
const C_MIN = 0.05;
const C_MAX = 0.13;

// data URL → resolved RGB tuple (or null). Also holds in-flight promises so
// concurrent hovers over the same card share one decode.
const cache = new Map<string, Promise<[number, number, number] | null>>();

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** sRGB (0..255) → OKLCH (L 0..1, C ≥ 0, h in 0..360). */
function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const rl = toLinear(r / 255);
  const gl = toLinear(g / 255);
  const bl = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h];
}

/** OKLCH → linear sRGB (unclamped; may fall outside 0..1 when out of gamut). */
function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB (0..255, rounded), reducing chroma until it fits the gamut. */
function oklchToRgb(L: number, C: number, h: number): [number, number, number] {
  const inGamut = (c: [number, number, number]) =>
    c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let lin = oklchToLinear(L, C, h);
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear(L, lo, h);
  }
  return lin.map((v) => Math.round(clamp(fromLinear(clamp(v, 0, 1)), 0, 1) * 255)) as [
    number,
    number,
    number,
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

        const [L, C, h] = rgbToOklch(rAvg, gAvg, bAvg);
        // Grayscale source → borrow the indigo brand hue so the glow still has
        // a cinematic tint instead of a muddy gray.
        if (C < GRAYSCALE_C_THRESHOLD) {
          resolve(oklchToRgb(0.38, 0.09, INDIGO_HUE));
          return;
        }
        resolve(oklchToRgb(clamp(L, L_MIN, L_MAX), clamp(C, C_MIN, C_MAX), h));
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
