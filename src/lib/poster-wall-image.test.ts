import { describe, expect, it } from "vitest";
import { bestLayout, layoutHeight, layoutWall, wallColumns } from "./poster-wall-image";

const AREA = { width: 960, height: 1400, gap: 12 };

describe("wallColumns", () => {
  it("grows with the count like the profile wall", () => {
    expect(wallColumns(1)).toBe(1);
    expect(wallColumns(3)).toBe(2);
    expect(wallColumns(8)).toBe(3);
    expect(wallColumns(9)).toBe(4);
  });
});

describe("layoutWall", () => {
  it("keeps every poster's own aspect ratio", () => {
    const layout = layoutWall([3 / 4, 1, 1 / 2, 4 / 3], AREA);
    for (const tile of layout.tiles) {
      const aspect = [3 / 4, 1, 1 / 2, 4 / 3][tile.index];
      expect(tile.w / tile.h).toBeCloseTo(aspect, 5);
    }
    expect(layout.overflow).toBe(0);
  });

  it("never lets a tile cross the bottom edge, and counts the rest as overflow", () => {
    const many = new Array(40).fill(3 / 4);
    const layout = layoutWall(many, AREA);
    for (const t of layout.tiles) expect(t.y + t.h).toBeLessThanOrEqual(AREA.height + 1e-6);
    expect(layout.tiles.length + layout.overflow).toBe(40);
    expect(layout.overflow).toBeGreaterThan(0);
  });

  it("fills columns shortest-first so the top row reads left to right", () => {
    const layout = layoutWall([3 / 4, 3 / 4, 3 / 4, 3 / 4], AREA); // 3 cols
    const top = layout.tiles.filter((t) => t.y === 0).map((t) => t.index);
    expect(top).toEqual([0, 1, 2]);
    expect(layout.tiles[3].y).toBeGreaterThan(0);
  });

  it("scales a lone poster taller than the area down to fit", () => {
    const layout = layoutWall([1 / 4], AREA);
    expect(layout.tiles).toHaveLength(1);
    expect(layout.tiles[0].h).toBe(AREA.height);
    expect(layout.tiles[0].w).toBeCloseTo(AREA.height / 4, 5);
    expect(layout.tiles[0].x).toBeGreaterThan(0); // centred in its column
  });

  it("falls back to a portrait shape for a missing aspect", () => {
    const layout = layoutWall([0], AREA);
    expect(layout.tiles[0].w / layout.tiles[0].h).toBeCloseTo(3 / 4, 5);
  });

  it("reports the used height for vertical centring", () => {
    const layout = layoutWall([1], AREA);
    expect(layoutHeight(layout)).toBeCloseTo(960, 5);
  });
});

describe("bestLayout", () => {
  it("uses the fewest columns that fit everything: four portraits go two by two", () => {
    const layout = bestLayout([3 / 4, 3 / 4, 3 / 4, 3 / 4], AREA);
    expect(layout.cols).toBe(2);
    expect(layout.overflow).toBe(0);
  });

  it("widens as the wall grows, and caps at four columns with overflow", () => {
    expect(bestLayout(new Array(9).fill(3 / 4), AREA).cols).toBe(3);
    const big = bestLayout(new Array(40).fill(3 / 4), AREA);
    expect(big.cols).toBe(4);
    expect(big.overflow).toBeGreaterThan(0);
  });

  it("gives a single poster the whole width", () => {
    expect(bestLayout([3 / 4], AREA).cols).toBe(1);
  });
});
