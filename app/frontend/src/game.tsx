import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { playerColor } from "./format";
import type { GameState } from "./types";

interface GameContextValue {
  state?: GameState;
  error?: string;
  reload: () => Promise<void>;
  players: string[];
  colorOf: (player: string) => string;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame outside GameProvider");
  return ctx;
}

/** Map + scores data, shared by all pages and refreshed after every action. */
export function GameProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, setState] = useState<GameState>();
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    try {
      setState(await api.state());
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    reload();
    // Pick up the other player's moves when you come back to the app.
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  // Stable order for colours: alphabetical, same as the API.
  const playerKey = (state?.scores.map((s) => s.player) ?? []).sort().join("\n");
  const players = useMemo(() => (playerKey ? playerKey.split("\n") : []), [playerKey]);
  const colorOf = useCallback((p: string) => playerColor(p, players), [players]);

  return <GameContext.Provider value={{ state, error, reload, players, colorOf }}>{children}</GameContext.Provider>;
}
