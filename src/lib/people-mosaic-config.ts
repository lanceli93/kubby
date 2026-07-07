// Shared config shape for the home People hero poster mosaic (columns, angle,
// flow, image sources, person-type/favorites filters). Used by the personal-metadata
// API, the /api/people/hero-wall endpoint, and the Preferences UI.

import type { MosaicAngle, MosaicFlow } from "./hero-mosaic-config";

export type PersonMosaicType = "actor" | "director" | "writer" | "producer";

export interface PeopleMosaicConfig {
  columnCount: number;                    // 8–24
  angle: MosaicAngle;
  flow: MosaicFlow;                       // "vertical" = columns drift up/down; "horizontal" = rows drift left/right
  includeFanart: boolean;                 // pair each photo with the person's own fanart
  includeGallery: boolean;                // mix in images from each person's gallery
  galleryCount: number;                   // 0–10 gallery images per person
  personTypes: PersonMosaicType[];        // subset of actor/director/writer/producer; [] = all
  favoritesOnly: boolean;
}

export const DEFAULT_PEOPLE_MOSAIC_CONFIG: PeopleMosaicConfig = {
  columnCount: 16,
  angle: "classic",
  flow: "vertical",
  includeFanart: true,
  includeGallery: true,
  galleryCount: 3,
  personTypes: ["actor"],
  favoritesOnly: false,
};

const MOSAIC_ANGLE_KEYS: MosaicAngle[] = ["flat", "gentle", "classic", "steep", "reverse"];
const MOSAIC_FLOWS: MosaicFlow[] = ["vertical", "horizontal"];
const PERSON_TYPES: PersonMosaicType[] = ["actor", "director", "writer", "producer"];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// Keeps only valid person-type strings; invalid entries are dropped. An empty
// (or missing/non-array) input falls back to the default; an explicit empty
// array survives normalization to mean "all types".
function normalizePersonTypes(value: unknown): PersonMosaicType[] {
  if (!Array.isArray(value)) return [...DEFAULT_PEOPLE_MOSAIC_CONFIG.personTypes];
  const result: PersonMosaicType[] = [];
  for (const raw of value) {
    if (PERSON_TYPES.includes(raw as PersonMosaicType) && !result.includes(raw as PersonMosaicType)) {
      result.push(raw as PersonMosaicType);
    }
  }
  return result;
}

// Merges a possibly-partial/invalid value onto the defaults. Never throws.
export function normalizePeopleMosaicConfig(raw: unknown): PeopleMosaicConfig {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<PeopleMosaicConfig>;

  return {
    columnCount: clampInt(input.columnCount, 8, 24, DEFAULT_PEOPLE_MOSAIC_CONFIG.columnCount),
    angle: MOSAIC_ANGLE_KEYS.includes(input.angle as MosaicAngle)
      ? (input.angle as MosaicAngle)
      : DEFAULT_PEOPLE_MOSAIC_CONFIG.angle,
    flow: MOSAIC_FLOWS.includes(input.flow as MosaicFlow)
      ? (input.flow as MosaicFlow)
      : DEFAULT_PEOPLE_MOSAIC_CONFIG.flow,
    includeFanart: normalizeBool(input.includeFanart, DEFAULT_PEOPLE_MOSAIC_CONFIG.includeFanart),
    includeGallery: normalizeBool(input.includeGallery, DEFAULT_PEOPLE_MOSAIC_CONFIG.includeGallery),
    galleryCount: clampInt(input.galleryCount, 0, 10, DEFAULT_PEOPLE_MOSAIC_CONFIG.galleryCount),
    personTypes: normalizePersonTypes(input.personTypes),
    favoritesOnly: normalizeBool(input.favoritesOnly, DEFAULT_PEOPLE_MOSAIC_CONFIG.favoritesOnly),
  };
}
