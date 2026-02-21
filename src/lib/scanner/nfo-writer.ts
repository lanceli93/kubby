import fs from "fs";
import path from "path";

export interface NfoActorEntry {
  name: string;
  role: string;
  thumb?: string;
  order: number;
}

export interface NfoStreamDetail {
  streamType: "video" | "audio" | "subtitle";
  codec?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  bitDepth?: number;
  frameRate?: string;
  channels?: number;
  channelLayout?: string;
  language?: string;
  sampleRate?: number;
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
  videoCodec?: string;
  audioCodec?: string;
  videoWidth?: number;
  videoHeight?: number;
  audioChannels?: number;
  durationInSeconds?: number;
  tags?: string[];
  streamDetails?: NfoStreamDetail[];
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
  for (const tag of data.tags ?? []) {
    xml += `  <tag>${escapeXml(tag)}</tag>\n`;
  }
  if (data.streamDetails && data.streamDetails.length > 0) {
    // Rich stream details from probe
    xml += `  <fileinfo>\n    <streamdetails>\n`;
    for (const s of data.streamDetails) {
      if (s.streamType === "video") {
        xml += `      <video>\n`;
        if (s.codec) xml += `        <codec>${escapeXml(s.codec)}</codec>\n`;
        if (s.width) xml += `        <width>${s.width}</width>\n`;
        if (s.height) xml += `        <height>${s.height}</height>\n`;
        if (s.bitrate) xml += `        <bitrate>${s.bitrate}</bitrate>\n`;
        if (s.bitDepth) xml += `        <bitdepth>${s.bitDepth}</bitdepth>\n`;
        if (s.frameRate) xml += `        <framerate>${escapeXml(s.frameRate)}</framerate>\n`;
        if (data.durationInSeconds) xml += `        <durationinseconds>${data.durationInSeconds}</durationinseconds>\n`;
        xml += `      </video>\n`;
      } else if (s.streamType === "audio") {
        xml += `      <audio>\n`;
        if (s.codec) xml += `        <codec>${escapeXml(s.codec)}</codec>\n`;
        if (s.channels) xml += `        <channels>${s.channels}</channels>\n`;
        if (s.channelLayout) xml += `        <channellayout>${escapeXml(s.channelLayout)}</channellayout>\n`;
        if (s.language) xml += `        <language>${escapeXml(s.language)}</language>\n`;
        if (s.sampleRate) xml += `        <samplingrate>${s.sampleRate}</samplingrate>\n`;
        xml += `      </audio>\n`;
      } else if (s.streamType === "subtitle") {
        xml += `      <subtitle>\n`;
        if (s.codec) xml += `        <codec>${escapeXml(s.codec)}</codec>\n`;
        if (s.language) xml += `        <language>${escapeXml(s.language)}</language>\n`;
        xml += `      </subtitle>\n`;
      }
    }
    xml += `    </streamdetails>\n  </fileinfo>\n`;
  } else if (data.videoCodec || data.audioCodec || data.durationInSeconds) {
    // Legacy fallback
    xml += `  <fileinfo>\n    <streamdetails>\n`;
    if (data.videoCodec || data.videoWidth || data.videoHeight || data.durationInSeconds) {
      xml += `      <video>\n`;
      if (data.videoCodec) xml += `        <codec>${escapeXml(data.videoCodec)}</codec>\n`;
      if (data.videoWidth) xml += `        <width>${data.videoWidth}</width>\n`;
      if (data.videoHeight) xml += `        <height>${data.videoHeight}</height>\n`;
      if (data.durationInSeconds) xml += `        <durationinseconds>${data.durationInSeconds}</durationinseconds>\n`;
      xml += `      </video>\n`;
    }
    if (data.audioCodec || data.audioChannels) {
      xml += `      <audio>\n`;
      if (data.audioCodec) xml += `        <codec>${escapeXml(data.audioCodec)}</codec>\n`;
      if (data.audioChannels) xml += `        <channels>${data.audioChannels}</channels>\n`;
      xml += `      </audio>\n`;
    }
    xml += `    </streamdetails>\n  </fileinfo>\n`;
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
