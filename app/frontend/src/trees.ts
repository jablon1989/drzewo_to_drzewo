import { useEffect, useState } from "react";
import type { Tree } from "./types";

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dp = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export interface NearTree {
  tree: Tree;
  distance: number;
}

/** The n trees closest to a point, nearest first. */
export function nearestTrees(trees: Tree[], lat: number, lon: number, n = 6): NearTree[] {
  return trees
    .map((tree) => ({ tree, distance: distanceM(lat, lon, tree.lat, tree.lon) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** The kind of tree (genus in Polish, as the city lists it), e.g. "Klon". */
export function treeKind(tree: Tree): string {
  if (tree.g) return tree.g;
  const first = tree.pl.split(" ")[0] ?? tree.pl;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** "klon zwyczajny · 120 cm" */
export function treeLabel(tree: Tree): string {
  return tree.cm ? `${tree.pl} · ${tree.cm} cm` : tree.pl;
}

export interface TreeData {
  list: Tree[];
  byId: Map<string, Tree>;
  park: GeoJSON.Feature<GeoJSON.Polygon>;
}

let cached: Promise<TreeData> | undefined;

/** Loads data/trees.json + the park outline once (a separate, cached chunk). */
export function loadTrees(): Promise<TreeData> {
  cached ??= Promise.all([import("@data/trees.json"), import("@data/park.json")]).then(([t, p]) => {
    const file = t.default;
    return {
      list: file.trees,
      byId: new Map(file.trees.map((tree) => [tree.id, tree])),
      park: p.default,
    };
  });
  return cached;
}

export function useTrees(): TreeData | undefined {
  const [data, setData] = useState<TreeData>();
  useEffect(() => {
    let alive = true;
    loadTrees().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** Centre of Park Południowy, for the first view of the map. */
export const PARK_CENTER: [number, number] = [51.0758, 17.0109];
