// data/*.json at the repo root (see the @data alias in vite.config.ts).
// Typed by hand so TypeScript doesn't have to parse the 3000-tree file.
declare module "@data/trees.json" {
  const value: import("./types").TreesFile;
  export default value;
}

declare module "@data/park.json" {
  const value: GeoJSON.Feature<GeoJSON.Polygon>;
  export default value;
}
