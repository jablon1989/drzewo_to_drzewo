import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useApi } from "../api";
import { CaptureFlow } from "../components/CaptureFlow";
import { duration, timeAgo } from "../format";
import { useGame } from "../game";
import { useTrees } from "../trees";
import type { Challenge } from "../types";

export default function ChallengesPage() {
  const api = useApi();
  const navigate = useNavigate();
  const trees = useTrees();
  const { state, reload } = useGame();
  const [challenges, setChallenges] = useState<Challenge[]>();
  const [error, setError] = useState<string>();
  const [hiding, setHiding] = useState(false);

  const load = useCallback(() => {
    api
      .challenges()
      .then(setChallenges)
      .catch((e: Error) => setError(e.message));
  }, [api]);
  useEffect(load, [load]);

  const toFind = challenges?.filter((c) => c.status === "open" && c.role === "seeker") ?? [];
  const mine = challenges?.filter((c) => c.status === "open" && c.role === "hider") ?? [];
  const done = challenges?.filter((c) => c.status !== "open") ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Hide &amp; seek</h1>
        <button className="btn primary" onClick={() => setHiding(true)} disabled={!trees}>
          🐺 Hide a tree
        </button>
      </header>
      <p className="muted small">
        Take a photo of Aura in front of a tree. The other player gets only the photo and has to find the tree and take
        the same photo there. Wrong guesses tell you how far off you are.
      </p>
      {error && <p className="error">{error}</p>}
      {!challenges && !error && <p className="muted">Loading…</p>}

      {challenges && (
        <>
          <section>
            <h2>Find these {toFind.length > 0 && <span className="badge inline">{toFind.length}</span>}</h2>
            {toFind.length === 0 && <p className="muted small">Nothing to find right now. Your turn to hide one?</p>}
            <div className="cards">
              {toFind.map((c) => (
                <ChallengeCard key={c.challenge_id} c={c} />
              ))}
            </div>
          </section>

          <section>
            <h2>Your hidden trees</h2>
            {mine.length === 0 && <p className="muted small">You have no hidden tree waiting.</p>}
            <div className="cards">
              {mine.map((c) => (
                <ChallengeCard key={c.challenge_id} c={c} />
              ))}
            </div>
          </section>

          {done.length > 0 && (
            <section>
              <h2>Finished</h2>
              <ul className="list">
                {done.map((c) => (
                  <li key={c.challenge_id}>
                    <Link to={`/hunt/${c.challenge_id}`} className="list-row">
                      {c.thumb_url && <img src={c.thumb_url} alt="" className="list-thumb" />}
                      <div>
                        {c.status === "solved" ? (
                          <>
                            <strong>{c.solved_by}</strong> found {c.creator}'s tree in{" "}
                            {duration(c.created_at, c.closed_at ?? c.created_at)}
                            {c.points !== undefined && <span className="points"> +{c.points}</span>}
                          </>
                        ) : (
                          <>
                            <strong>{c.gave_up_by}</strong> gave up on {c.creator}'s tree
                            <span className="points"> +5 for {c.creator}</span>
                          </>
                        )}
                        <div className="small muted">
                          {c.tree?.pl} · {timeAgo(c.closed_at ?? c.created_at)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {hiding && trees && (
        <CaptureFlow
          mode="hide"
          trees={trees}
          found={state?.found}
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

function ChallengeCard({ c }: { c: Challenge }) {
  const wrong = c.guesses.filter((g) => !g.correct);
  const last = wrong[wrong.length - 1];
  return (
    <Link to={`/hunt/${c.challenge_id}`} className="challenge-card">
      {c.photo_url && <img src={c.thumb_url ?? c.photo_url} alt="Aura in front of the hidden tree" />}
      <div className="challenge-card-body">
        <strong>{c.role === "seeker" ? `From ${c.creator}` : "Waiting…"}</strong>
        {c.note && <div className="note">“{c.note}”</div>}
        <div className="small muted">
          {timeAgo(c.created_at)}
          {wrong.length > 0 && ` · ${wrong.length} wrong guess${wrong.length === 1 ? "" : "es"}`}
          {last && ` · last: ${last.distance_m} m`}
          {c.hints.length > 0 && ` · ${c.hints.length} hint${c.hints.length === 1 ? "" : "s"}`}
        </div>
      </div>
    </Link>
  );
}
