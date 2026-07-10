// Google Photos style justified layout: pack items of varying aspect ratios
// into equal-height rows that each fill the container width, scaling every tile
// to a shared row height. The last row is NOT stretched (kept at target height).
//
// Pure function — no DOM, no React — so it's trivially testable and memoizable.

export interface JustifiedInput {
  /** Aspect ratio (width / height). Falls back to 1 upstream when unknown. */
  aspect: number;
}

export interface JustifiedTile {
  /** Index into the original items array. */
  index: number;
  width: number;
  height: number;
}

export interface JustifiedRow {
  height: number;
  tiles: JustifiedTile[];
}

export interface JustifiedLayoutOptions {
  containerWidth: number;
  targetHeight: number;
  /** Horizontal + vertical gap between tiles, in px. */
  gap?: number;
}

/**
 * Lay items out into justified rows.
 *
 * Algorithm: greedily accumulate tiles (at target height) into a row until the
 * summed width exceeds the available content width, then scale the row up/down
 * so it fills the width exactly. The final trailing row is left at target
 * height and left-aligned (no stretching), matching Google Photos behaviour.
 */
export function computeJustifiedLayout(
  items: JustifiedInput[],
  { containerWidth, targetHeight, gap = 4 }: JustifiedLayoutOptions,
): JustifiedRow[] {
  const rows: JustifiedRow[] = [];
  if (containerWidth <= 0 || items.length === 0) return rows;

  let rowIndices: number[] = [];
  // Summed width of the current row's tiles at the target height (excludes gaps).
  let rowWidthAtTarget = 0;

  const flushRow = (isLastRow: boolean) => {
    if (rowIndices.length === 0) return;

    const gapTotal = gap * (rowIndices.length - 1);
    const availableWidth = containerWidth - gapTotal;

    // Scale the row so its tiles + gaps fill the container width. The trailing
    // row keeps the target height (scale 1) unless it already overflows.
    let scale = availableWidth / rowWidthAtTarget;
    if (isLastRow && scale > 1) scale = 1;

    const rowHeight = Math.round(targetHeight * scale);
    const tiles: JustifiedTile[] = rowIndices.map((index) => {
      const aspect = items[index].aspect;
      return {
        index,
        width: Math.round(aspect * targetHeight * scale),
        height: rowHeight,
      };
    });

    rows.push({ height: rowHeight, tiles });
    rowIndices = [];
    rowWidthAtTarget = 0;
  };

  for (let i = 0; i < items.length; i++) {
    const aspect = items[i].aspect > 0 ? items[i].aspect : 1;
    const tileWidth = aspect * targetHeight;
    rowIndices.push(i);
    rowWidthAtTarget += tileWidth;

    const gapTotal = gap * (rowIndices.length - 1);
    // Row is "full" once the tiles at target height plus gaps reach the width.
    if (rowWidthAtTarget + gapTotal >= containerWidth) {
      flushRow(false);
    }
  }

  // Any remaining tiles form the trailing row.
  flushRow(true);

  return rows;
}
