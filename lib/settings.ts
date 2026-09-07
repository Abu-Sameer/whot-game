/**
 * The player's own preferences: how hard the bots play, whether the game makes
 * any noise, and how many are at the table by default.
 *
 * These live in localStorage rather than in game state, because they outlive
 * any one game — which makes them state from outside React, so they are served
 * through a store React can subscribe to rather than copied into a component.
 * That is what lets the server render the defaults and the browser swap in what
 * was actually saved, with no hydration mismatch between the two.
 *
 * Everything read back out of storage is checked, since it can be missing,
 * blocked, or hold whatever an older build happened to leave behind.
 */
import type { Difficulty } from "./types";

export interface Settings {
  difficulty: Difficulty;
  sound: boolean;
  /** Seats at the table when starting an elimination game. */
  numPlayers: number;
}

const STORE = "whot-settings";

export const DEFAULT_SETTINGS: Settings = {
  difficulty: "medium",
  sound: true,
  numPlayers: 4,
};

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const saved = parsed as Record<string, unknown>;
    // Each field is taken only if it is still one of the values this build
    // understands, so an older or hand-edited entry cannot put the game into a
    // state it has no screen for.
    return {
      difficulty: DIFFICULTIES.includes(saved.difficulty as Difficulty)
        ? (saved.difficulty as Difficulty)
        : DEFAULT_SETTINGS.difficulty,
      sound:
        typeof saved.sound === "boolean" ? saved.sound : DEFAULT_SETTINGS.sound,
      numPlayers:
        typeof saved.numPlayers === "number" &&
        saved.numPlayers >= 2 &&
        saved.numPlayers <= 4
          ? Math.floor(saved.numPlayers)
          : DEFAULT_SETTINGS.numPlayers,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Cached, because a store's snapshot has to be the same object between changes
// or React will re-render on every check looking for one that settles.
let current: Settings | null = null;
const watchers = new Set<() => void>();

export function subscribeSettings(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

export function getSettings(): Settings {
  current ??= read();
  return current;
}

/** What the server renders: it has no storage to read. */
export function getDefaultSettings(): Settings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(next: Settings): void {
  current = next;
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // Preferences just will not survive a reload; the game is unaffected.
  }
  for (const onChange of watchers) onChange();
}

/** What each level plays like, for the settings screen to explain itself. */
export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "Plays whatever is legal without a plan, and sometimes misses a play altogether.",
  medium: "Keeps its Whot back and takes a free skip when one is going.",
  hard: "Plays to hurt whoever is next, and sheds its heaviest cards while it can.",
};
