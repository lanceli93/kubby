/**
 * Minimal, dependency-free `.tar.gz` extractor.
 *
 * Demo Mode downloads its asset pack as a single gzipped tarball from a GitHub
 * release and unpacks it into the data dir. Packaged Kubby installs ship only a
 * bundled Node runtime + `server.js` — no `tar` binary and no extra npm deps —
 * so we can't shell out to `tar` or pull in a package. Node's built-in `zlib`
 * handles the gunzip; this reads the resulting tar stream ourselves.
 *
 * We only need to read tarballs THIS repo produces (GNU tar / `tar czf`), so the
 * reader supports the ustar + GNU-longname (`L`) + PAX-path (`x`) cases those
 * emit — enough to round-trip our own pack step. It is NOT a general-purpose tar
 * implementation. Path traversal (`..`, absolute) entries are rejected.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const BLOCK = 512;

function readString(buf: Buffer, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && buf[end] !== 0) end++;
  return buf.toString("utf-8", offset, end);
}

/** Parse an octal numeric tar field (space/NUL padded). Returns 0 if empty. */
function readOctal(buf: Buffer, offset: number, length: number): number {
  const s = readString(buf, offset, length).trim();
  if (!s) return 0;
  const n = parseInt(s, 8);
  return Number.isNaN(n) ? 0 : n;
}

/** Extract a PAX extended-header record set: `"<len> key=value\n"` repeated. */
function parsePax(block: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  const text = block.toString("utf-8");
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(" ", i);
    if (sp < 0) break;
    const len = parseInt(text.slice(i, sp), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = text.slice(sp + 1, i + len - 1); // drop trailing "\n"
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

/**
 * Extract a gzipped tar buffer into `destDir`. Creates parent dirs as needed.
 * Throws on a malformed archive or a path-traversal entry.
 */
export function extractTarGz(gzBuffer: Buffer, destDir: string): void {
  const tar = zlib.gunzipSync(gzBuffer);
  fs.mkdirSync(destDir, { recursive: true });
  const destRoot = path.resolve(destDir);

  let offset = 0;
  let longName: string | null = null; // pending GNU 'L' long name
  let paxName: string | null = null; // pending PAX 'path' override

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    offset += BLOCK;

    // Two consecutive zero blocks mark end-of-archive.
    if (header.every((b) => b === 0)) {
      if (offset + BLOCK <= tar.length && tar.subarray(offset, offset + BLOCK).every((b) => b === 0)) break;
      continue;
    }

    const size = readOctal(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156]);
    const dataStart = offset;
    const dataBlocks = Math.ceil(size / BLOCK);
    offset += dataBlocks * BLOCK;

    // GNU long name: the NEXT header's name comes from this entry's payload.
    if (typeFlag === "L") {
      longName = readString(tar, dataStart, size).replace(/\0+$/, "");
      continue;
    }
    // PAX extended header: may carry a UTF-8 `path` for the next entry.
    if (typeFlag === "x" || typeFlag === "g") {
      const attrs = parsePax(tar.subarray(dataStart, dataStart + size));
      if (typeFlag === "x" && attrs.path) paxName = attrs.path;
      continue;
    }

    // Resolve the entry name: PAX > GNU-longname > ustar name(+prefix).
    let name = paxName ?? longName;
    if (name === null) {
      const rawName = readString(header, 0, 100);
      const prefix = readString(header, 345, 155);
      name = prefix ? `${prefix}/${rawName}` : rawName;
    }
    longName = null;
    paxName = null;

    const normalized = name.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) continue;

    const target = path.resolve(destRoot, normalized);
    if (target !== destRoot && !target.startsWith(destRoot + path.sep)) {
      throw new Error(`tar entry escapes destination: ${name}`);
    }

    if (typeFlag === "5") {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    // Treat regular ('0'/'\0'/'7') as files; skip links/devices we never pack.
    if (typeFlag === "0" || typeFlag === "\0" || typeFlag === "7" || typeFlag === "") {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, tar.subarray(dataStart, dataStart + size));
    }
  }
}
