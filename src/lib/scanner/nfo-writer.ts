import fs from "fs";
import path from "path";

export interface NfoActorEntry {
  name: string;
  role: string;
  thumb?: string;
  order: number;
}

export interface NfoMovieData {
  title: string;
  originalTitle?: string;
  sortTitle?: string;
  overview?: string;
  tagline?: string;
  rating?: number;
  mpaa?: string;
  runtime?: number;
  premiered?: string;
  year?: number;
  genres?: string[];
  studios?: string[];
  country?: string;
  tmdbId?: string;
  imdbId?: string;
  actors?: NfoActorEntry[];
  directors?: string[];
}

/**
 * Generate a complete Kodi/Jellyfin-compatible movie.nfo from TMDB data.
 */
export function writeFullNfo(nfoPath: string, data: NfoMovieData): void {
  const dir = path.dirname(nfoPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<movie>\n`;
  xml += `  <title>${escapeXml(data.title)}</title>\n`;
  if (data.originalTitle) xml += `  <originaltitle>${escapeXml(data.originalTitle)}</originaltitle>\n`;
  xml += `  <sorttitle>${escapeXml(data.sortTitle || data.title)}</sorttitle>\n`;
  if (data.overview) xml += `  <plot>${escapeXml(data.overview)}</plot>\n`;
  if (data.tagline) xml += `  <tagline>${escapeXml(data.tagline)}</tagline>\n`;
  if (data.rating != null) xml += `  <rating>${data.rating}</rating>\n`;
  if (data.mpaa) xml += `  <mpaa>${escapeXml(data.mpaa)}</mpaa>\n`;
  if (data.runtime != null) xml += `  <runtime>${data.runtime}</runtime>\n`;
  if (data.premiered) xml += `  <premiered>${escapeXml(data.premiered)}</premiered>\n`;
  if (data.year != null) xml += `  <year>${data.year}</year>\n`;
  for (const genre of data.genres ?? []) {
    xml += `  <genre>${escapeXml(genre)}</genre>\n`;
  }
  for (const studio of data.studios ?? []) {
    xml += `  <studio>${escapeXml(studio)}</studio>\n`;
  }
  if (data.country) xml += `  <country>${escapeXml(data.country)}</country>\n`;
  if (data.tmdbId) xml += `  <uniqueid type="tmdb">${escapeXml(data.tmdbId)}</uniqueid>\n`;
  if (data.imdbId) xml += `  <uniqueid type="imdb">${escapeXml(data.imdbId)}</uniqueid>\n`;
  for (const actor of data.actors ?? []) {
    xml += `  <actor>\n`;
    xml += `    <name>${escapeXml(actor.name)}</name>\n`;
    xml += `    <role>${escapeXml(actor.role)}</role>\n`;
    if (actor.thumb) xml += `    <thumb>${escapeXml(actor.thumb)}</thumb>\n`;
    xml += `    <order>${actor.order}</order>\n`;
    xml += `  </actor>\n`;
  }
  for (const director of data.directors ?? []) {
    xml += `  <director>${escapeXml(director)}</director>\n`;
  }
  xml += `</movie>\n`;

  fs.writeFileSync(nfoPath, xml, "utf-8");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Remove all existing <actor>...</actor> blocks from an NFO file.
 */
export function stripActorsFromNfo(nfoPath: string): void {
  let content = fs.readFileSync(nfoPath, "utf-8");
  content = content.replace(/\s*<actor>[\s\S]*?<\/actor>/g, "");
  fs.writeFileSync(nfoPath, content, "utf-8");
}

/**
 * Append <actor> elements to an existing movie.nfo file.
 * Uses string insertion before </movie> to preserve existing XML formatting.
 */
export function writeActorsToNfo(
  nfoPath: string,
  actors: NfoActorEntry[]
): void {
  if (actors.length === 0) return;

  let content = fs.readFileSync(nfoPath, "utf-8");

  const closingTag = "</movie>";
  const insertIndex = content.lastIndexOf(closingTag);
  if (insertIndex === -1) {
    throw new Error(`No ${closingTag} found in ${nfoPath}`);
  }

  const actorXml = actors
    .map((actor) => {
      let xml = `  <actor>\n`;
      xml += `    <name>${escapeXml(actor.name)}</name>\n`;
      xml += `    <role>${escapeXml(actor.role)}</role>\n`;
      if (actor.thumb) {
        xml += `    <thumb>${escapeXml(actor.thumb)}</thumb>\n`;
      }
      xml += `    <order>${actor.order}</order>\n`;
      xml += `  </actor>\n`;
      return xml;
    })
    .join("");

  const before = content.slice(0, insertIndex);
  const needsNewline = before.length > 0 && !before.endsWith("\n");
  const newContent =
    before + (needsNewline ? "\n" : "") + actorXml + content.slice(insertIndex);

  fs.writeFileSync(nfoPath, newContent, "utf-8");
}
