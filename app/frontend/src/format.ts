export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function duration(fromIso: string, toIso: string): string {
  const m = Math.max(1, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} days`;
}

/** Stable colour per player (first player green, second orange, …). */
const PLAYER_COLORS = ["#2f8f4e", "#d9822b", "#3b6fd1", "#b4489c"];

export function playerColor(player: string, players: string[]): string {
  const i = players.indexOf(player);
  return PLAYER_COLORS[(i >= 0 ? i : 0) % PLAYER_COLORS.length];
}

export const KIND_LABEL: Record<string, string> = {
  hide: "hid a tree",
  guess: "guessed",
  solve: "solved a hidden tree",
};
