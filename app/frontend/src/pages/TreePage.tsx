import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useApi } from "../api";
import { TreeMap } from "../components/TreeMap";
import { KIND_LABEL, timeAgo } from "../format";
import { useGame } from "../game";
import { useTrees } from "../trees";
import type { TreeFind } from "../types";

export default function TreePage() {
  const { treeId = "" } = useParams();
  const api = useApi();
  const trees = useTrees();
  const { state, colorOf } = useGame();
  const [finds, setFinds] = useState<TreeFind[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .tree(treeId)
      .then((r) => setFinds(r.finds))
      .catch((e: Error) => setError(e.message));
  }, [api, treeId]);

  const tree = trees?.byId.get(treeId);
  if (error) return <div className="center-screen error">{error}</div>;
  if (!trees) return <div className="center-screen muted">Loading…</div>;
  if (!tree) return <div className="center-screen muted">Unknown tree</div>;

  return (
    <div className="page">
      <p>
        <Link to="/" className="link small">
          ← Map
        </Link>
      </p>
      <header className="page-head">
        <h1>🌳 {tree.pl}</h1>
      </header>
      <dl className="facts">
        {tree.la && (
          <div>
            <dt>Latin</dt>
            <dd>
              <em>{tree.la}</em>
            </dd>
          </div>
        )}
        {tree.cm && (
          <div>
            <dt>Trunk</dt>
            <dd>{tree.cm} cm around</dd>
          </div>
        )}
        {tree.tag && (
          <div>
            <dt>Plate</dt>
            <dd>#{tree.tag}</dd>
          </div>
        )}
        <div>
          <dt>Found by</dt>
          <dd>{state?.found[tree.id]?.join(" & ") || "nobody yet"}</dd>
        </div>
      </dl>
      {tree.photo && (
        <p className="small">
          <a
            className="link"
            href={`https://portal.zzm.wroc.pl/api/api/v1/attachments/${tree.photo}/download`}
            target="_blank"
            rel="noreferrer"
          >
            City inventory photo ↗
          </a>
        </p>
      )}

      <TreeMap
        className="map map-small"
        trees={trees.list}
        park={trees.park}
        found={state?.found}
        selectedId={tree.id}
        focus={{ lat: tree.lat, lon: tree.lon, zoom: 19 }}
      />

      <section>
        <h2>Aura here</h2>
        {!finds && <p className="muted">Loading…</p>}
        {finds?.length === 0 && <p className="muted small">No photos at this tree yet.</p>}
        <div className="gallery">
          {finds?.map((f, i) => (
            <figure key={i}>
              <a href={f.photo_url} target="_blank" rel="noreferrer">
                <img src={f.thumb_url} alt={`Aura, photo by ${f.player}`} />
              </a>
              <figcaption className="small">
                <span className="dot" style={{ background: colorOf(f.player) }} /> {f.player}{" "}
                <span className="muted">
                  {KIND_LABEL[f.kind]} · {timeAgo(f.created_at)}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
