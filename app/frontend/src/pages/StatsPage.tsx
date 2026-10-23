import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useApi } from "../api";
import { timeAgo } from "../format";
import { useGame } from "../game";
import { treeKind, useTrees } from "../trees";
import type { Challenge, Tree } from "../types";

type View = "kinds" | "done";
type Sort = "count" | "name" | "done";

const CONIFERS = new Set([
  "Cis",
  "Świerk",
  "Daglezja",
  "Sosna",
  "Modrzew",
  "Choina",
  "Cyprysik",
  "Żywotnik",
  "Miłorząb",
]);

interface Species {
  pl: string;
  la?: string;
  count: number;
  done: number;
}

interface Kind {
  name: string;
  latin?: string;
  count: number;
  done: number;
  species: Species[];
}

const nf = new Intl.NumberFormat("pl-PL");

function groupByKind(trees: Tree[], found: Record<string, string[]>): Kind[] {
  const kinds = new Map<string, Kind>();
  const species = new Map<string, Map<string, Species>>();
  for (const t of trees) {
    const name = treeKind(t);
    const isDone = t.id in found;
    let k = kinds.get(name);
    if (!k) {
      k = { name, latin: t.la?.split(" ")[0], count: 0, done: 0, species: [] };
      kinds.set(name, k);
      species.set(name, new Map());
    }
    k.count += 1;
    if (isDone) k.done += 1;
    const sp = species.get(name)!;
    const s = sp.get(t.pl) ?? { pl: t.pl, la: t.la, count: 0, done: 0 };
    s.count += 1;
    if (isDone) s.done += 1;
    sp.set(t.pl, s);
  }
  for (const k of kinds.values()) {
    k.species = [...species.get(k.name)!.values()].sort((a, b) => b.count - a.count || a.pl.localeCompare(b.pl, "pl"));
  }
  return [...kinds.values()];
}

export default function StatsPage() {
  const trees = useTrees();
  const { state } = useGame();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("kinds");
  const [sort, setSort] = useState<Sort>("count");
  const [open, setOpen] = useState<string>();

  const found = state?.found ?? {};
  const kinds = useMemo(() => (trees ? groupByKind(trees.list, found) : []), [trees, found]);
  const sorted = useMemo(() => {
    const list = [...kinds];
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pl"));
    else if (sort === "done") list.sort((a, b) => b.done - a.done || b.count - a.count);
    else list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pl"));
    return list;
  }, [kinds, sort]);

  if (!trees) return <div className="center-screen muted">Loading trees…</div>;

  const total = trees.list.length;
  const doneTotal = Object.keys(found).length;
  const speciesTotal = new Set(trees.list.map((t) => t.pl)).size;
  const max = Math.max(...kinds.map((k) => k.count), 1);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Trees of the park</h1>
      </header>

      <div className="stat-row">
        <div className="stat">
          <strong>{nf.format(total)}</strong>
          <span>trees</span>
        </div>
        <div className="stat">
          <strong>{kinds.length}</strong>
          <span>kinds</span>
        </div>
        <div className="stat">
          <strong>{speciesTotal}</strong>
          <span>species</span>
        </div>
        <div className="stat done">
          <strong>{doneTotal}</strong>
          <span>done</span>
        </div>
      </div>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={view === "kinds"} onClick={() => setView("kinds")}>
          By kind
        </button>
        <button role="tab" aria-selected={view === "done"} onClick={() => setView("done")}>
          Done in the game
        </button>
      </div>

      {view === "kinds" && (
        <>
          <div className="chips sort-chips">
            <span className="small muted">Sort:</span>
            {(
              [
                ["count", "Most trees"],
                ["done", "Most done"],
                ["name", "A–Z"],
              ] as [Sort, string][]
            ).map(([key, label]) => (
              <button key={key} className={`chip ${sort === key ? "active" : ""}`} onClick={() => setSort(key)}>
                {label}
              </button>
            ))}
          </div>

          <ul className="kind-list">
            {sorted.map((k) => {
              const expanded = open === k.name;
              return (
                <li key={k.name} className={`kind ${expanded ? "open" : ""}`}>
                  <button
                    className="kind-row"
                    onClick={() => setOpen(expanded ? undefined : k.name)}
                    aria-expanded={expanded}
                  >
                    <span className="kind-icon" aria-hidden>
                      {CONIFERS.has(k.name) ? "🌲" : "🌳"}
                    </span>
                    <span className="kind-name">
                      <strong>{k.name}</strong>
                      {k.latin && <em>{k.latin}</em>}
                    </span>
                    <span className="kind-count">{nf.format(k.count)}</span>
                    <span className="kind-bar" aria-hidden>
                      <span className="all" style={{ width: `${(100 * k.count) / max}%` }}>
                        <span className="done" style={{ width: `${(100 * k.done) / k.count}%` }} />
                      </span>
                    </span>
                    <span className="kind-done small">{k.done > 0 ? `✓ ${k.done} done` : ""}</span>
                  </button>
                  {expanded && (
                    <div className="kind-detail">
                      <ul>
                        {k.species.map((s) => (
                          <li key={s.pl}>
                            <span>
                              {s.pl} {s.la && <em className="muted">{s.la}</em>}
                            </span>
                            <span className="muted">
                              {nf.format(s.count)}
                              {s.done > 0 && <span className="points"> · ✓ {s.done}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <button
                        className="btn small-btn"
                        onClick={() => navigate(`/?kind=${encodeURIComponent(k.name)}`)}
                      >
                        Show all {nf.format(k.count)} on the map →
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {view === "done" && <DoneList trees={trees.byId} />}
    </div>
  );
}

/** Trees completed in the game: found as the other player's hidden tree. */
function DoneList({ trees }: { trees: Map<string, Tree> }) {
  const api = useApi();
  const [solved, setSolved] = useState<Challenge[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .challenges()
      .then((list) =>
        setSolved(
          list
            .filter((c) => c.status === "solved" && c.tree_id)
            .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")),
        ),
      )
      .catch((e: Error) => setError(e.message));
  }, [api]);

  if (error) return <p className="error">{error}</p>;
  if (!solved) return <p className="muted">Loading…</p>;
  if (solved.length === 0)
    return (
      <p className="muted empty-done">
        No trees done yet. A tree is done when it's found as the other player's hidden tree, so{" "}
        <Link className="link" to="/hunt">
          hide one
        </Link>
        !
      </p>
    );

  return (
    <ul className="list">
      {solved.map((c) => {
        const t = trees.get(c.tree_id!);
        return (
          <li key={c.challenge_id}>
            <Link to={`/hunt/${c.challenge_id}`} className="list-row">
              {(c.solve?.thumb_url ?? c.thumb_url) && (
                <img src={c.solve?.thumb_url ?? c.thumb_url} alt="" className="list-thumb" />
              )}
              <div>
                <strong>{t?.pl ?? c.tree_id}</strong>
                {t && <span className="muted small"> · {treeKind(t)}</span>}
                <div className="small muted">
                  Hidden by {c.creator}, found by {c.solved_by} · {timeAgo(c.closed_at ?? c.created_at)}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
