/** One tree from data/trees.json (Wrocław ZZM tree inventory). */
export interface Tree {
  id: string;
  lat: number;
  lon: number;
  /** Polish name, e.g. "klon zwyczajny" */
  pl: string;
  /** Latin name */
  la?: string;
  /** Genus in Polish, e.g. "Klon" */
  g?: string;
  /** Trunk circumference at 130 cm, in cm */
  cm?: number;
  /** Number on the metal plate on the trunk */
  tag?: string;
  /** City photo attachment id */
  photo?: string;
  monument?: boolean;
  valuable?: boolean;
}

export interface TreesFile {
  meta: { park: string; source: string; count: number };
  trees: Tree[];
}

export interface PhotoUrls {
  photo_url?: string;
  thumb_url?: string;
}

export interface ScoreRow {
  player: string;
  points: number;
  trees: number;
  photos: number;
  hidden: number;
  solved: number;
  stumped: number;
  gave_up: number;
}

export type FindKind = "hide" | "guess" | "solve";

export interface Activity extends PhotoUrls {
  player: string;
  kind: FindKind;
  created_at: string;
  challenge_id?: string;
  /** Missing when it would give away a hidden tree */
  tree_id?: string;
  species?: string;
}

export interface GameState {
  player: string;
  total_trees: number;
  /** tree id -> players who photographed Aura there */
  found: Record<string, string[]>;
  scores: ScoreRow[];
  recent: Activity[];
  open_for_me: number;
}

export interface Guess {
  player: string;
  tree_id: string;
  correct: boolean;
  distance_m: number;
  warmth: string;
  at: string;
  thumb_url?: string;
}

export type Hint =
  | { type: "species"; at: string; value: { pl: string; la?: string; cm?: number } }
  | { type: "zone"; at: string; value: { lat: number; lon: number; radius_m: number } }
  | { type: "tag"; at: string; value: { tag: string } };

export type HintType = Hint["type"];

export interface Challenge extends PhotoUrls {
  challenge_id: string;
  creator: string;
  status: "open" | "solved" | "gave_up" | "cancelled";
  role: "hider" | "seeker";
  note?: string;
  created_at: string;
  closed_at?: string;
  solved_by?: string;
  gave_up_by?: string;
  hints: Hint[];
  guesses: Guess[];
  /** Only when you may see it: you hid it, or it is finished */
  tree_id?: string;
  tree?: Tree;
  solve?: PhotoUrls;
  points?: number;
}

export interface GuessResult {
  correct: boolean;
  distance_m: number;
  warmth: string;
  challenge: Challenge;
}

export interface TreeFind extends PhotoUrls {
  player: string;
  kind: FindKind;
  created_at: string;
}
