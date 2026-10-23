import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useApi } from "../api";
import { CaptureFlow } from "../components/CaptureFlow";
import { TreeMap } from "../components/TreeMap";
import { useGame } from "../game";
import type { Position } from "../photo";
import { distanceM, formatDistance, treeKind, treeLabel, useTrees } from "../trees";
import type { Tree } from "../types";

export default function MapPage() {
  const api = useApi();
  const navigate = useNavigate();
  const trees = useTrees();
  const { state, error, reload, players, colorOf } = useGame();
  const [params, setParams] = useSearchParams();
  const [onlyPlayer, setOnlyPlayer] = useState<string | null>(null);
  const [hiding, setHiding] = useState(false);
  const [picked, setPicked] = useState<Tree>();
  const [me, setMe] = useState<Position>();
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom?: number }>();

  // ?kind=Dąb (from the Trees tab): show only that kind clearly.
  const kind = params.get("kind");
  const kindIds = useMemo(
    () => (kind && trees ? new Set(trees.list.filter((t) => treeKind(t) === kind).map((t) => t.id)) : undefined),
    [kind, trees],
  );

  // Blue dot: follow the phone's location while the map is open.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, source: "device" }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const found = state?.found ?? {};
  const doneIds = Object.keys(found).filter((id) => !onlyPlayer || found[id].includes(onlyPlayer));
  const foundCount = kindIds ? doneIds.filter((id) => kindIds.has(id)).length : doneIds.length;
  const total = kindIds?.size ?? state?.total_trees ?? trees?.list.length ?? 0;
  const pickedBy = picked ? (found[picked.id] ?? []) : [];

  return (
    <div className="map-page">
      {trees ? (
        <TreeMap
          trees={trees.list}
          park={trees.park}
          found={found}
          onlyPlayer={onlyPlayer}
          playerColor={colorOf}
          selectedId={picked?.id}
          highlightIds={kindIds}
          onTreeClick={setPicked}
          me={me}
          focus={focus}
        />
      ) : (
        <div className="map center-screen muted">Loading trees…</div>
      )}

      <div className="map-overlay top">
        <div className="counter">
          <strong>{foundCount}</strong> / {total} {kind ? kind.toLowerCase() : "trees"} done
          <div className="progress">
            <div style={{ width: `${total ? (100 * foundCount) / total : 0}%` }} />
          </div>
        </div>
        <div className="chips">
          {kind && (
            <button className="chip active kind-chip" onClick={() => setParams({})} aria-label={`Show all trees`}>
              🌳 {kind} ✕
            </button>
          )}
          <button className={`chip ${onlyPlayer === null ? "active" : ""}`} onClick={() => setOnlyPlayer(null)}>
            Everyone
          </button>
          {players.map((p) => (
            <button
              key={p}
              className={`chip ${onlyPlayer === p ? "active" : ""}`}
              onClick={() => setOnlyPlayer(p)}
              style={{ ["--dot" as string]: colorOf(p) }}
            >
              <span className="dot" /> {p}
            </button>
          ))}
        </div>
        {error && <p className="error small">{error}</p>}
      </div>

      <div className="map-overlay bottom">
        {picked && (
          <div className="tree-card">
            <button className="icon-btn close" onClick={() => setPicked(undefined)} aria-label="Close">
              ✕
            </button>
            <strong>{treeLabel(picked)}</strong>
            <div className="small muted">
              {picked.la}
              {picked.tag && ` · plate #${picked.tag}`}
              {me && ` · ${formatDistance(distanceM(me.lat, me.lon, picked.lat, picked.lon))} from you`}
            </div>
            <div className="small">
              {pickedBy.length ? `✅ Done – found by ${pickedBy.join(" & ")}` : "Not done yet"}
              {" · "}
              <a className="link" onClick={() => navigate(`/trees/${encodeURIComponent(picked.id)}`)}>
                Details
              </a>
            </div>
          </div>
        )}
        <div className="fab-row">
          {me && (
            <button
              className="fab small"
              onClick={() => setFocus({ lat: me.lat, lon: me.lon, zoom: 19 })}
              aria-label="Where am I"
            >
              📍
            </button>
          )}
          <button className="fab primary" onClick={() => setHiding(true)}>
            🐺 Hide a tree
          </button>
        </div>
      </div>

      {hiding && trees && (
        <CaptureFlow
          mode="hide"
          trees={trees}
          found={found}
          onClose={() => setHiding(false)}
          onSubmit={async (p) => {
            const c = await api.hideTree(p);
            setHiding(false);
            await reload();
            navigate(`/hunt/${c.challenge_id}`);
          }}
        />
      )}
    </div>
  );
}
