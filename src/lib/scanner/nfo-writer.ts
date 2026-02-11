import fs from "fs";

export interface NfoActorEntry {
  name: string;
  role: string;
  thumb?: string;
  order: number;
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
