// Layout for the story-sized poster-wall image (#228). Pure geometry, no DOM:
// the canvas code in poster-wall-export.ts asks this where each poster goes,
// so the packing is unit-tested and the drawing stays a dumb loop.

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export interface WallTile {
  /** Index into the aspects array handed in (newest first). */
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WallLayout {
  tiles: WallTile[];
  /** Posters that did not fit; shown as a "+N more" badge. */
  overflow: number;
  cols: number;
}

// Few gigs → big posters; more gigs → a denser mosaic, like the profile wall.
export function wallColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 8) return 3;
  return 4;
}

// Masonry: each poster keeps its own aspect ratio (a tall poster stays tall)
// and drops into the shortest column, newest first. Packing stops at the first
// poster that would cross the bottom edge, and everything after it counts as
// overflow - a partial poster hanging off the bottom of a story looks like a
// bug, a "+N more" badge reads as intended.
//
// `aspects` are width / height. A single poster taller than the area is scaled
// down to fit rather than cut.
export function layoutWall(
  aspects: number[],
  area: { width: number; height: number; gap: number },
  cols: number = wallColumns(aspects.length)
): WallLayout {
  const colWidth = (area.width - (cols - 1) * area.gap) / cols;
  const heights = new Array<number>(cols).fill(0);
  const tiles: WallTile[] = [];

  for (let i = 0; i < aspects.length; i++) {
    const aspect = aspects[i] > 0 ? aspects[i] : 3 / 4;
    let w = colWidth;
    let h = w / aspect;
    // Shortest column; ties go left so the top row fills left-to-right.
    let col = 0;
    for (let c = 1; c < cols; c++) if (heights[c] < heights[col]) col = c;
    let y = heights[col] === 0 ? 0 : heights[col] + area.gap;

    if (h > area.height) {
      // Only possible for a lone very tall poster: shrink to the area height.
      h = area.height;
      w = h * aspect;
      y = 0;
    }
    if (y + h > area.height) {
      return { tiles, overflow: aspects.length - i, cols };
    }
    const x = col * (colWidth + area.gap) + (colWidth - w) / 2;
    tiles.push({ index: i, x, y, w, h });
    heights[col] = y + h;
  }
  return { tiles, overflow: 0, cols };
}

// The vertical extent actually used, so the mosaic can be centred in the area
// when it does not fill it (one or two posters).
export function layoutHeight(layout: WallLayout): number {
  return layout.tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0);
}

export const MAX_WALL_COLUMNS = 4;

// The layout to draw: the FEWEST columns that still fit every poster, so a
// wall of four is two-by-two rather than three-plus-an-orphan, and posters are
// as big as the story allows. When even four columns overflow, the four-column
// layout wins and the rest become the "+N more" badge.
export function bestLayout(
  aspects: number[],
  area: { width: number; height: number; gap: number }
): WallLayout {
  let last: WallLayout | null = null;
  for (let cols = 1; cols <= MAX_WALL_COLUMNS; cols++) {
    last = layoutWall(aspects, area, cols);
    if (last.overflow === 0) return last;
  }
  return last as WallLayout;
}
