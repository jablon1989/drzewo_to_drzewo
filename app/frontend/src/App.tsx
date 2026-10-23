import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router";
import { GameProvider, useGame } from "./game";
import { LoginPage } from "./pages/LoginPage";
import { useSession } from "./session";

// Pages with the map (Leaflet + the tree list) load as separate chunks.
const MapPage = lazy(() => import("./pages/MapPage"));
const ChallengesPage = lazy(() => import("./pages/ChallengesPage"));
const ChallengePage = lazy(() => import("./pages/ChallengePage"));
const ScoresPage = lazy(() => import("./pages/ScoresPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const TreePage = lazy(() => import("./pages/TreePage"));

export function App() {
  const session = useSession();

  if (session.loading) return <div className="center-screen muted">Loading…</div>;
  if (!session.player) return <LoginPage />;

  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function Shell() {
  const session = useSession();
  const { state } = useGame();
  const toFind = state?.open_for_me ?? 0;

  return (
    <div className="app">
      <main className="main">
        <Suspense fallback={<div className="center-screen muted">Loading…</div>}>
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/hunt" element={<ChallengesPage />} />
            <Route path="/hunt/:challengeId" element={<ChallengePage />} />
            <Route path="/scores" element={<ScoresPage />} />
            <Route path="/trees" element={<StatsPage />} />
            <Route path="/trees/:treeId" element={<TreePage />} />
            <Route path="*" element={<div className="center-screen muted">Page not found</div>} />
          </Routes>
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          <span aria-hidden>🗺️</span>
          Map
        </NavLink>
        <NavLink to="/hunt">
          <span aria-hidden>🐺</span>
          Hide &amp; seek
          {toFind > 0 && <span className="badge">{toFind}</span>}
        </NavLink>
        <NavLink to="/trees" end>
          <span aria-hidden>🌳</span>
          Trees
        </NavLink>
        <NavLink to="/scores">
          <span aria-hidden>🏆</span>
          Scores
        </NavLink>
        <a href="https://pusiaczkowo.pl" title="All our apps">
          <span aria-hidden>🏠</span>
          Pusiaczkowo
        </a>
        <button className="tab-player" onClick={session.logout} title="Log out">
          <span aria-hidden>👤</span>
          {session.player}
        </button>
      </nav>
    </div>
  );
}
