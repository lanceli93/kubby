/**
 * Split a raw artist tag into individual artist names.
 *
 * Why: music files often tag a collaboration as a single string
 * ("周杰伦&林迈可", "陈奕迅、王菲", "周杰伦-费玉清"). Treating that blob as one
 * artist is wrong — it should be several artists, and once split the album
 * grouping ("same title + shares ≥1 artist") can correctly collapse duet tracks
 * into the same album as the solo tracks.
 *
 * The hard part is NOT over-splitting Western band names that legitimately
 * contain the same punctuation: "AC/DC", "Simon & Garfunkel",
 * "Earth, Wind & Fire", "Jay-Z", "Blink-182". Product decision: **CJK artists
 * split, Western ones don't** — so a separator only splits when a CJK character
 * sits next to it (the signal that this is a CJK collaboration string):
 *
 *   - `、` (ideographic comma): ALWAYS splits — it is CJK-only punctuation.
 *   - `&` / `＆`: splits when a CJK char is the nearest non-space neighbour on
 *     EITHER side ("周杰伦&Ashin" ✓, "Simon & Garfunkel" ✗).
 *   - `-` / `－`: splits only when a CJK char is adjacent on BOTH sides
 *     ("周杰伦-费玉清" ✓, "Jay-Z" ✗, "陈奕迅-Eason" ✗) — the hyphen is the most
 *     ambiguous separator, so it needs the strongest guard.
 *
 * `feat.`/`ft.`/`,`/`;`/`/` are intentionally NOT treated as separators (not
 * requested, and each is a common false-positive source).
 */

// CJK letter class: CJK radicals/symbols/unified + Hiragana/Katakana (covered by
// ⺀-鿿), Hangul syllables, CJK compatibility ideographs, halfwidth kana.
const CJK_CHAR = /[⺀-鿿가-힯豈-﫿ｦ-ﾟ]/;

// Split-point sentinel — a NUL char, which can never appear in a real tag, so
// converting a separator to it never collides with existing spaces in a name.
const SENT = String.fromCharCode(0);

/** Nearest meaningful character before `idx` (skips spaces/sentinels), or "". */
function prevNeighbour(str: string, idx: number): string {
  for (let i = idx - 1; i >= 0; i--) {
    const ch = str[i];
    if (ch !== " " && ch !== "\t" && ch !== SENT) return ch;
  }
  return "";
}

/** Nearest meaningful character at/after `idx` (skips spaces/sentinels), or "". */
function nextNeighbour(str: string, idx: number): string {
  for (let i = idx; i < str.length; i++) {
    const ch = str[i];
    if (ch !== " " && ch !== "\t" && ch !== SENT) return ch;
  }
  return "";
}

export function splitArtistNames(raw: string | null | undefined): string[] {
  const input = (raw ?? "").trim();
  if (!input) return [];

  // 1. 顿号 always marks a boundary (CJK-exclusive punctuation).
  let s = input.replace(/、/g, SENT);

  // 2. & / ＆ — split when CJK on EITHER side.
  s = s.replace(/[&＆]/g, (m, offset: number, full: string) => {
    const before = prevNeighbour(full, offset);
    const after = nextNeighbour(full, offset + 1);
    return CJK_CHAR.test(before) || CJK_CHAR.test(after) ? SENT : m;
  });

  // 3. - / － — split only when CJK on BOTH sides (hyphen is the riskiest).
  s = s.replace(/[-－]/g, (m, offset: number, full: string) => {
    const before = prevNeighbour(full, offset);
    const after = nextNeighbour(full, offset + 1);
    return CJK_CHAR.test(before) && CJK_CHAR.test(after) ? SENT : m;
  });

  const parts = s
    .split(SENT)
    .map((p) => p.trim())
    .filter(Boolean);

  // No boundary found (or everything trimmed away) → the original is one artist.
  return parts.length > 1 ? parts : [input];
}
