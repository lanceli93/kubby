import path from "path";
import { sanitizePersonName } from "@/lib/tmdb";
import { getPeopleMetadataDir } from "@/lib/paths";

const METADATA_DIR = getPeopleMetadataDir();

export function getPersonDir(person: { photoPath: string | null; name: string }): string {
  if (person.photoPath) {
    return path.dirname(person.photoPath);
  }
  const sanitized = sanitizePersonName(person.name);
  const firstLetter = sanitized.charAt(0).toUpperCase() || "_";
  return path.join(METADATA_DIR, firstLetter, sanitized);
}
