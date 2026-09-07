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
import type { Difficulty, Rules } from "./types";
import { DEFAULT_RULES } from "./gameLogic";

export interface Settings {
  difficulty: Difficulty;
  sound: boolean;
  /** Seats at the table when starting an elimination game. */
  numPlayers: number;
  /** Which of the game's rules to play by. See Rules in lib/types.ts. */
  rules: Rules;
}

const STORE = "whot-settings";

export const DEFAULT_SETTINGS: Settings = {
  difficulty: "medium",
  sound: true,
  numPlayers: 4,
  rules: DEFAULT_RULES,
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
      rules: readRules(saved.rules),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Reads the rule switches back one at a time.
 *
 * Taken switch by switch rather than all or nothing, so a build that adds a
 * new rule keeps the ones the player had already set instead of resetting
 * every one of them to the defaults.
 */
function readRules(value: unknown): Rules {
  if (typeof value !== "object" || value === null) return DEFAULT_RULES;
  const saved = value as Record<string, unknown>;
  const pick = (key: keyof Rules) =>
    typeof saved[key] === "boolean" ? (saved[key] as boolean) : DEFAULT_RULES[key];
  return {
    pick2: pick("pick2"),
    pick3: pick("pick3"),
    suspension: pick("suspension"),
    holdAll: pick("holdAll"),
    endOnSpecial: pick("endOnSpecial"),
    doubles: pick("doubles"),
  };
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

/** Each rule as the settings screen shows it. */
export const RULE_LABELS: { key: keyof Rules; label: string; blurb: string }[] =
  [
    {
      key: "pick2",
      label: "Pick 2",
      blurb: "A 2 makes the next player draw two and miss their turn.",
    },
    {
      key: "pick3",
      label: "Pick 3",
      blurb:
        "A 5 makes the next player draw three — unless they answer with a 5, which cancels it.",
    },
    {
      key: "suspension",
      label: "Suspension",
      blurb: "An 8 skips the next player.",
    },
    {
      key: "holdAll",
      label: "Hold All",
      blurb: "Any card may be played on a 1, and you keep the turn.",
    },
    {
      key: "doubles",
      label: "Double number",
      blurb: "Cards of the same number may be played together in one turn.",
    },
    {
      key: "endOnSpecial",
      label: "1, 8, 14 and Whot can win",
      blurb:
        "Off, a round cannot be won on one of those — holding one as your last card means going to market.",
    },
  ];

/** What each level plays like, for the settings screen to explain itself. */
export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "Plays whatever is legal without a plan, and sometimes misses a play altogether.",
  medium: "Keeps its Whot back and takes a free skip when one is going.",
  hard: "Plays to hurt whoever is next, and sheds its heaviest cards while it can.",
};
