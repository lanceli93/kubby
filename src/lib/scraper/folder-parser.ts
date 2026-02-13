/**
 * Parse a movie folder name into title and optional year.
 * Handles patterns like:
 *   "Inception (2010)" → { title: "Inception", year: 2010 }
 *   "The Matrix" → { title: "The Matrix" }
 *   "Spider-Man No Way Home (2021)" → { title: "Spider-Man No Way Home", year: 2021 }
 */
export function parseFolderName(name: string): { title: string; year?: number } {
  // Match trailing (YYYY) pattern
  const match = name.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  if (match) {
    return { title: match[1].trim(), year: parseInt(match[2], 10) };
  }
  return { title: name.trim() };
}
