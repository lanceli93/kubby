import path from "path";
import { sanitizePersonName } from "@/lib/tmdb";

const METADATA_DIR = path.join(process.cwd(), "data", "metadata", "people");

export function getPersonDir(person: { photoPath: string | null; name: string }): string {
  if (person.photoPath) {
    return path.dirname(person.photoPath);
  }
  const sanitized = sanitizePersonName(person.name);
  const firstLetter = sanitized.charAt(0).toUpperCase() || "_";
  return path.join(METADATA_DIR, firstLetter, sanitized);
}
