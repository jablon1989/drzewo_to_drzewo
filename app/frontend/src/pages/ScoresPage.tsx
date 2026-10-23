import { Link } from "react-router";
import { KIND_LABEL, timeAgo } from "../format";
import { useGame } from "../game";

export default function ScoresPage() {
  const { state, error, colorOf } = useGame();
  if (error) return <div className="center-screen error">{error}</div>;
  if (!state) return <div className="center-screen muted">Loading…</div>;

  const foundTotal = Object.keys(state.found).length;
  const pct = state.total_trees ? (100 * foundTotal) / state.total_trees : 0;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Scores</h1>
      </header>

      <div className="big-counter">
        <div>
          <strong>{foundTotal}</strong> / {state.total_trees}
        </div>
        <div className="muted small">trees in Park Południowy found together ({pct.toFixed(1)}%)</div>
        <div className="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="score-cards">
        {state.scores.map((s, i) => (
          <div key={s.player} className="score-card" style={{ ["--player" as string]: colorOf(s.player) }}>
            <div className="score-head">
              <span className="rank">{i === 0 && s.points > 0 ? "👑" : `#${i + 1}`}</span>
              <strong>{s.player}</strong>
              <span className="score-points">{s.points} pts</span>
            </div>
            <dl>
              <div>
                <dt>Hidden trees found</dt>
                <dd>{s.solved}</dd>
              </div>
              <div>
                <dt>Photos of Aura</dt>
                <dd>{s.photos}</dd>
              </div>
              <div>
                <dt>Trees hidden</dt>
                <dd>{s.hidden}</dd>
              </div>
              <div>
                <dt>Stumped the other</dt>
                <dd>{s.stumped}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <p className="small muted">
        A tree is done (green on the map) when it's found as the other player's hidden tree. Points: 10 for finding a
        hidden tree (−2 per wrong guess, −3 per hint, at least 3) · 5 when the other player gives up on your tree.
      </p>

      <section>
        <h2>Latest</h2>
        {state.recent.length === 0 && <p className="muted small">Nothing yet – go for a walk with Aura!</p>}
        <ul className="list">
          {state.recent.map((a, i) => (
            <li key={i} className="list-row">
              {a.thumb_url ? (
                <img src={a.thumb_url} alt="" className="list-thumb" />
              ) : (
                <div className="list-thumb secret">🤫</div>
              )}
              <div>
                <span className="dot" style={{ background: colorOf(a.player) }} /> <strong>{a.player}</strong>{" "}
                {KIND_LABEL[a.kind] ?? a.kind}
                {a.tree_id && (
                  <>
                    {" "}
                    –{" "}
                    <Link className="link" to={`/trees/${encodeURIComponent(a.tree_id)}`}>
                      {a.species}
                    </Link>
                  </>
                )}
                <div className="small muted">{timeAgo(a.created_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
