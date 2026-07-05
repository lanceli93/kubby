// Shared config shape for the home hero poster mosaic (columns, style, angle,
// per-library weighting, year/resolution filters). Used by the personal-metadata
// API, the /api/movies/hero-wall endpoint, and the Preferences UI.

export type MosaicStyle = "poster" | "fanart" | "both";
export type MosaicAngle = "flat" | "gentle" | "classic" | "steep" | "reverse";
export type MosaicFlow = "vertical" | "horizontal";

export interface HeroMosaicConfig {
  columnCount: number;                    // 8–24
  style: MosaicStyle;
  angle: MosaicAngle;
  flow: MosaicFlow;                       // "vertical" = columns drift up/down; "horizontal" = rows drift left/right
  libraryWeights: Record<string, number>; // libraryId → 0–100; {} = proportional random across all libraries; 0 = exclude
  yearFrom: number | null;
  yearTo: number | null;
  minWidth: number | null;                // minimum videoWidth, e.g. 1280/1920/2500/3500
}

export const DEFAULT_HERO_MOSAIC_CONFIG: HeroMosaicConfig = {
  columnCount: 16,
  style: "both",
  angle: "classic",
  flow: "vertical",
  libraryWeights: {},
  yearFrom: null,
  yearTo: null,
  minWidth: null,
};

// CSS transform presets for the tilted wall plane. "classic" MUST equal the
// current hardcoded transform in src/components/home/hero-mosaic.tsx:
// perspective(1600px) rotateX(24deg) rotateZ(-16deg) scale(1.34)
export const MOSAIC_ANGLES: Record<MosaicAngle, string> = {
  flat: "perspective(1600px) scale(1.08)",
  gentle: "perspective(1600px) rotateX(14deg) rotateZ(-8deg) scale(1.18)",
  classic: "perspective(1600px) rotateX(24deg) rotateZ(-16deg) scale(1.34)",
  steep: "perspective(1600px) rotateX(32deg) rotateZ(-22deg) scale(1.48)",
  reverse: "perspective(1600px) rotateX(24deg) rotateZ(16deg) scale(1.34)",
};

const MOSAIC_STYLES: MosaicStyle[] = ["poster", "fanart", "both"];
const MOSAIC_ANGLE_KEYS: MosaicAngle[] = ["flat", "gentle", "classic", "steep", "reverse"];
const MOSAIC_FLOWS: MosaicFlow[] = ["vertical", "horizontal"];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeYear(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

function normalizeMinWidth(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeLibraryWeights(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== "string") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    result[key] = Math.min(100, Math.max(0, n));
  }
  return result;
}

// Merges a possibly-partial/invalid value onto the defaults. Never throws.
export function normalizeHeroMosaicConfig(raw: unknown): HeroMosaicConfig {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<HeroMosaicConfig>;

  return {
    columnCount: clampInt(input.columnCount, 8, 24, DEFAULT_HERO_MOSAIC_CONFIG.columnCount),
    style: MOSAIC_STYLES.includes(input.style as MosaicStyle)
      ? (input.style as MosaicStyle)
      : DEFAULT_HERO_MOSAIC_CONFIG.style,
    angle: MOSAIC_ANGLE_KEYS.includes(input.angle as MosaicAngle)
      ? (input.angle as MosaicAngle)
      : DEFAULT_HERO_MOSAIC_CONFIG.angle,
    flow: MOSAIC_FLOWS.includes(input.flow as MosaicFlow)
      ? (input.flow as MosaicFlow)
      : DEFAULT_HERO_MOSAIC_CONFIG.flow,
    libraryWeights: normalizeLibraryWeights(input.libraryWeights),
    yearFrom: normalizeYear(input.yearFrom),
    yearTo: normalizeYear(input.yearTo),
    minWidth: normalizeMinWidth(input.minWidth),
  };
}
