import { describe, expect, it } from "vitest";
import { duration, playerColor } from "./format";
import { distanceM, formatDistance, nearestTrees } from "./trees";
import type { Tree } from "./types";

const trees: Tree[] = [
  { id: "a", lat: 51.0, lon: 17.0, pl: "dąb" },
  { id: "b", lat: 51.0001, lon: 17.0, pl: "klon" },
  { id: "c", lat: 51.001, lon: 17.0, pl: "lipa" },
];

describe("trees", () => {
  it("measures distance in metres", () => {
    expect(distanceM(51, 17, 51.001, 17)).toBeGreaterThan(110);
    expect(distanceM(51, 17, 51.001, 17)).toBeLessThan(112);
  });

  it("finds the nearest trees first", () => {
    const near = nearestTrees(trees, 51.00012, 17.0, 2);
    expect(near.map((n) => n.tree.id)).toEqual(["b", "a"]);
    expect(Math.round(near[0].distance)).toBe(2);
  });

  it("formats distances", () => {
    expect(formatDistance(12.4)).toBe("12 m");
    expect(formatDistance(1540)).toBe("1.5 km");
  });
});

describe("format", () => {
  it("gives each player a stable colour", () => {
    expect(playerColor("Asia", ["Asia", "Bartosz"])).not.toBe(playerColor("Bartosz", ["Asia", "Bartosz"]));
  });

  it("shows how long a hunt took", () => {
    expect(duration("2026-01-01T10:00:00Z", "2026-01-01T10:25:00Z")).toBe("25 min");
    expect(duration("2026-01-01T10:00:00Z", "2026-01-01T12:05:00Z")).toBe("2 h 5 min");
  });
});
