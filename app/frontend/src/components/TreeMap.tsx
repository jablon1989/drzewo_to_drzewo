import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Circle, CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Position } from "../photo";
import { PARK_CENTER, treeLabel } from "../trees";
import type { Tree } from "../types";

export const FOUND_COLOR = "#2f9e44";
const UNFOUND_COLOR = "#8d978f";
const SELECTED_COLOR = "#f2c94c";
const HIGHLIGHT_COLOR = "#d9822b";

export interface MapPin {
  lat: number;
  lon: number;
  color: string;
  label: string;
}

interface Props {
  trees: Tree[];
  park?: GeoJSON.Feature<GeoJSON.Polygon>;
  /** tree id -> players who found it */
  found?: Record<string, string[]>;
  /** Colour trees by this one player's finds (null = anyone). */
  onlyPlayer?: string | null;
  playerColor?: (player: string) => string;
  selectedId?: string;
  /** Show only these trees clearly (e.g. one kind); the rest fade out. */
  highlightIds?: Set<string>;
  onTreeClick?: (tree: Tree) => void;
  me?: Position;
  zone?: { lat: number; lon: number; radius_m: number };
  pins?: MapPin[];
  /** Move the map here when it changes. */
  focus?: { lat: number; lon: number; zoom?: number };
  className?: string;
  children?: ReactNode;
}

function radiusForZoom(zoom: number): number {
  if (zoom <= 15) return 2;
  if (zoom === 16) return 3;
  if (zoom === 17) return 4.5;
  if (zoom === 18) return 6.5;
  return 9;
}

/** Thousands of trees as canvas circles (React components per tree would be too slow on a phone). */
function TreesLayer({ trees, found, onlyPlayer, playerColor, selectedId, highlightIds, onTreeClick }: Props) {
  const map = useMap();
  const markers = useRef(new Map<string, L.CircleMarker>());
  const clickRef = useRef(onTreeClick);
  clickRef.current = onTreeClick;

  useEffect(() => {
    const renderer = L.canvas({ padding: 0.3, tolerance: 6 });
    const group = L.layerGroup().addTo(map);
    const radius = radiusForZoom(map.getZoom());
    markers.current.clear();
    for (const tree of trees) {
      const m = L.circleMarker([tree.lat, tree.lon], { renderer, radius, weight: 1, bubblingMouseEvents: false });
      m.on("click", () => clickRef.current?.(tree));
      m.bindTooltip(treeLabel(tree), { direction: "top", offset: [0, -4] });
      m.addTo(group);
      markers.current.set(tree.id, m);
    }
    const onZoom = () => {
      const r = radiusForZoom(map.getZoom());
      markers.current.forEach((m) => m.setRadius(r));
    };
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
      group.remove();
    };
  }, [map, trees]);

  useEffect(() => {
    markers.current.forEach((m, id) => {
      const who = found?.[id] ?? [];
      const isFound = onlyPlayer ? who.includes(onlyPlayer) : who.length > 0;
      const fill = isFound ? (onlyPlayer && playerColor ? playerColor(onlyPlayer) : FOUND_COLOR) : UNFOUND_COLOR;
      const selected = id === selectedId;
      const faded = highlightIds !== undefined && !highlightIds.has(id) && !selected;
      const highlighted = highlightIds?.has(id) && !isFound;
      m.setStyle({
        fillColor: highlighted ? HIGHLIGHT_COLOR : fill,
        fillOpacity: faded ? 0.08 : isFound || highlighted ? 0.9 : 0.45,
        color: selected ? SELECTED_COLOR : isFound ? "#1d5e2b" : highlighted ? "#9a4f05" : "#6b746d",
        weight: selected ? 4 : 1,
        opacity: faded ? 0.12 : selected ? 1 : 0.7,
      });
      if (selected || highlighted || (highlightIds && isFound && !faded)) m.bringToFront();
    });
  }, [found, onlyPlayer, playerColor, selectedId, highlightIds, trees]);

  return null;
}

function FocusOn({ focus }: { focus?: Props["focus"] }) {
  const map = useMap();
  const key = focus ? `${focus.lat},${focus.lon},${focus.zoom}` : "";
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], focus.zoom ?? Math.max(map.getZoom(), 18), { duration: 0.6 });
  }, [key, map]);
  return null;
}

export function TreeMap(props: Props) {
  const { park, me, zone, pins, focus, className, children } = props;
  const parkStyle = useMemo(() => ({ color: "#2f6b3f", weight: 2, fillOpacity: 0.04, dashArray: "6 6" }), []);
  return (
    <MapContainer
      className={className ?? "map"}
      center={focus ? [focus.lat, focus.lon] : PARK_CENTER}
      zoom={focus?.zoom ?? 17}
      maxZoom={21}
      zoomControl={false}
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={21}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · trees: ZZM Wrocław'
      />
      {park && <GeoJSON data={park} style={parkStyle} interactive={false} />}
      <TreesLayer {...props} />
      {zone && (
        <Circle
          center={[zone.lat, zone.lon]}
          radius={zone.radius_m}
          pathOptions={{ color: "#d9822b", weight: 2, fillOpacity: 0.12, dashArray: "4 6" }}
          interactive={false}
        />
      )}
      {pins?.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lon]}
          radius={7}
          pathOptions={{ color: "#fff", weight: 2, fillColor: p.color, fillOpacity: 1 }}
        >
          <Tooltip>{p.label}</Tooltip>
        </CircleMarker>
      ))}
      {me && (
        <>
          {me.accuracy && me.accuracy < 200 && (
            <Circle
              center={[me.lat, me.lon]}
              radius={me.accuracy}
              pathOptions={{ color: "#3b82f6", weight: 1, fillOpacity: 0.1 }}
              interactive={false}
            />
          )}
          <CircleMarker
            center={[me.lat, me.lon]}
            radius={7}
            pathOptions={{ color: "#fff", weight: 3, fillColor: "#3b82f6", fillOpacity: 1 }}
            interactive={false}
          />
        </>
      )}
      <FocusOn focus={focus} />
      {children}
    </MapContainer>
  );
}
