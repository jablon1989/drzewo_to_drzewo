import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "../api";
import { CaptureFlow } from "../components/CaptureFlow";
import { TreeMap, type MapPin } from "../components/TreeMap";
import { duration, timeAgo } from "../format";
import { useGame } from "../game";
import { treeLabel, useTrees } from "../trees";
import type { Challenge, GuessResult, HintType } from "../types";

const HINTS: { type: HintType; label: string; help: string }[] = [
  { type: "species", label: "🌿 Species", help: "What kind of tree it is" },
  { type: "zone", label: "⭕ Area", help: "A 40 m circle on the map" },
  { type: "tag", label: "🔢 Plate number", help: "The number on the trunk plate" },
];

const WARMTH_COLOR: Record<string, string> = {
  "right next to it": "#c92a2a",
  hot: "#e8590c",
  warm: "#f59f00",
  cool: "#4dabf7",
  cold: "#1c7ed6",
};

export default function ChallengePage() {
  const { challengeId = "" } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const trees = useTrees();
  const { reload } = useGame();
  const [c, setC] = useState<Challenge>();
  const [error, setError] = useState<string>();
  const [guessing, setGuessing] = useState(false);
  const [result, setResult] = useState<GuessResult>();
  const [busy, setBusy] = useState(false);
  const [bigPhoto, setBigPhoto] = useState<string>();

  const load = useCallback(() => {
    api
      .challenge(challengeId)
      .then(setC)
      .catch((e: Error) => setError(e.message));
  }, [api, challengeId]);
  useEffect(load, [load]);

  const pins: MapPin[] = useMemo(() => {
    if (!c || !trees) return [];
    return c.guesses
      .filter((g) => !g.correct)
      .flatMap((g, i) => {
        const t = trees.byId.get(g.tree_id);
        return t
          ? [
              {
                lat: t.lat,
                lon: t.lon,
                color: WARMTH_COLOR[g.warmth] ?? "#888",
                label: `Guess ${i + 1}: ${g.distance_m} m`,
              },
            ]
          : [];
      });
  }, [c, trees]);

  if (error) return <div className="center-screen error">{error}</div>;
  if (!c) return <div className="center-screen muted">Loading…</div>;

  const open = c.status === "open";
  const seeker = c.role === "seeker";
  const zone = c.hints.find((h) => h.type === "zone");
  const wrong = c.guesses.filter((g) => !g.correct).length;
  const potential = Math.max(3, 10 - 2 * wrong - 3 * c.hints.length);

  async function act(fn: () => Promise<Challenge>) {
    setBusy(true);
    setError(undefined);
    try {
      setC(await fn());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const focus = c.tree
    ? { lat: c.tree.lat, lon: c.tree.lon, zoom: 18 }
    : zone
      ? { lat: zone.value.lat, lon: zone.value.lon, zoom: 18 }
      : undefined;

  return (
    <div className="page">
      <p>
        <Link to="/hunt" className="link small">
          ← Hide &amp; seek
        </Link>
      </p>
      <header className="page-head">
        <h1>{seeker ? `${c.creator}'s hidden tree` : "Your hidden tree"}</h1>
        <span className={`status ${c.status}`}>{statusText(c)}</span>
      </header>
      <p className="small muted">
        Hidden {timeAgo(c.created_at)}
        {c.closed_at && ` · finished after ${duration(c.created_at, c.closed_at)}`}
      </p>
      {c.note && <p className="note">“{c.note}”</p>}

      <div className={`photo-pair ${c.solve ? "two" : ""}`}>
        <figure>
          <img src={c.photo_url} alt="Aura in front of the hidden tree" onClick={() => setBigPhoto(c.photo_url)} />
          <figcaption>{c.creator}</figcaption>
        </figure>
        {c.solve && (
          <figure>
            <img src={c.solve.photo_url} alt="Aura at the same tree" onClick={() => setBigPhoto(c.solve?.photo_url)} />
            <figcaption>{c.solved_by}</figcaption>
          </figure>
        )}
      </div>

      {result && !result.correct && (
        <div className="banner" style={{ borderColor: WARMTH_COLOR[result.warmth] }}>
          Not this one. You're <strong>{result.distance_m} m</strong> away – <strong>{result.warmth}</strong>!
        </div>
      )}
      {result?.correct && (
        <div className="banner success">🎉 That's it! +{c.points} points. Your turn to hide a tree.</div>
      )}

      {open && seeker && (
        <section className="stack">
          <button className="btn primary big" onClick={() => setGuessing(true)} disabled={!trees}>
            📸 I found it!
          </button>
          <p className="small muted center">
            Worth {potential} points now (10, −2 per wrong guess, −3 per hint, at least 3).
          </p>
        </section>
      )}

      {c.tree && (
        <p>
          🌳{" "}
          <Link className="link" to={`/trees/${encodeURIComponent(c.tree.id)}`}>
            {treeLabel(c.tree)}
          </Link>
          {c.tree.tag && <span className="muted small"> · plate #{c.tree.tag}</span>}
        </p>
      )}

      {(c.hints.length > 0 || (open && seeker)) && (
        <section>
          <h2>Hints</h2>
          <div className="hints">
            {HINTS.map((h) => {
              const got = c.hints.find((x) => x.type === h.type);
              if (got)
                return (
                  <div key={h.type} className="hint got">
                    {hintText(got)}
                  </div>
                );
              if (!open || !seeker) return null;
              return (
                <button
                  key={h.type}
                  className="hint"
                  disabled={busy}
                  onClick={() =>
                    confirm(`${h.help}. Costs 3 points. Take the hint?`) && act(() => api.hint(c.challenge_id, h.type))
                  }
                >
                  {h.label}
                  <span className="small muted">−3 pts</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {trees && (focus || pins.length > 0) && (
        <section>
          <h2>Map</h2>
          <TreeMap
            className="map map-small"
            trees={trees.list}
            park={trees.park}
            selectedId={c.tree?.id}
            zone={zone?.value}
            pins={pins}
            focus={focus}
          />
        </section>
      )}

      {c.guesses.length > 0 && (
        <section>
          <h2>Guesses</h2>
          <ul className="list">
            {c.guesses.map((g, i) => (
              <li key={i} className="list-row">
                {g.thumb_url && <img src={g.thumb_url} alt="" className="list-thumb" />}
                <div>
                  {g.correct ? (
                    <strong>✅ Found it</strong>
                  ) : (
                    <>
                      <span className="dot" style={{ background: WARMTH_COLOR[g.warmth] }} /> {g.distance_m} m –{" "}
                      {g.warmth}
                    </>
                  )}
                  <div className="small muted">
                    {trees?.byId.get(g.tree_id)?.pl} · {timeAgo(g.at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <section className="danger-zone">
          {seeker ? (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                confirm(`Give up and see the tree? ${c.creator} gets 5 points.`) &&
                act(() => api.giveUp(c.challenge_id))
              }
            >
              🏳️ Give up
            </button>
          ) : (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Take this tree back? It disappears from the game.")) return;
                setBusy(true);
                try {
                  await api.cancel(c.challenge_id);
                  await reload();
                  navigate("/hunt");
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Cancel this challenge
            </button>
          )}
        </section>
      )}
      {error && <p className="error">{error}</p>}

      {guessing && trees && (
        <CaptureFlow
          mode="guess"
          trees={trees}
          onClose={() => setGuessing(false)}
          onSubmit={async (p) => {
            const r = await api.guess(c.challenge_id, p);
            setGuessing(false);
            setResult(r);
            setC(r.challenge);
            await reload();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {bigPhoto && (
        <div className="lightbox" onClick={() => setBigPhoto(undefined)}>
          <img src={bigPhoto} alt="" />
        </div>
      )}
    </div>
  );
}

function statusText(c: Challenge): string {
  switch (c.status) {
    case "open":
      return c.role === "seeker" ? "To find" : "Waiting";
    case "solved":
      return `Found by ${c.solved_by}`;
    case "gave_up":
      return `${c.gave_up_by} gave up`;
    default:
      return "Cancelled";
  }
}

function hintText(h: Challenge["hints"][number]): string {
  switch (h.type) {
    case "species":
      return `🌿 ${h.value.pl}${h.value.la ? ` (${h.value.la})` : ""}${h.value.cm ? `, trunk ${h.value.cm} cm` : ""}`;
    case "zone":
      return "⭕ It's inside the orange circle on the map";
    case "tag":
      return `🔢 Plate number ${h.value.tag}`;
  }
}
