"use client";

import { useEffect, useState } from "react";
import type { GameMode } from "@/lib/types";
import type { Seat } from "@/lib/gameLogic";
import { BOT_NAMES } from "@/lib/gameLogic";
import { speak } from "@/lib/sound";
import InstallButton from "./InstallButton";

interface PlayerSetupProps {
  onStart: (numPlayers: number, mode: GameMode, seats: Seat[]) => void;
  /** Hands over to the pairing screen for a game across several phones. */
  onNearby: () => void;
  onSettings: () => void;
  /** Seats an elimination game starts on, from Settings. */
  defaultPlayers: number;
}

const OPTIONS = [2, 3, 4];

const MAX_NAME = 12;

// Remembers the table between games so nobody retypes their name every round.
const STORE = "whot-seat-names";

const SCREEN =
  "flex h-full flex-col overflow-y-auto bg-cover bg-center text-white";
const PANEL = "m-auto flex w-full flex-col items-center p-4";

/**
 * What a seat's field starts out holding.
 *
 * The bots come pre-named. The person playing starts blank, so the first time
 * through they are prompted to put their own name in rather than being handed
 * one — after that it is remembered, and editable like any of the others.
 */
function defaultName(index: number): string {
  return index === 0 ? "" : (BOT_NAMES[index - 1] ?? `Player ${index}`);
}

/** What a seat ends up called if its field is left empty anyway. */
function fallbackName(index: number): string {
  return defaultName(index) || "You";
}

function storedNames(): string[] {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === "string");
  } catch {
    // No storage, or something else wrote nonsense there. Defaults will do.
    return [];
  }
}

export default function PlayerSetup({
  onStart,
  onNearby,
  onSettings,
  defaultPlayers,
}: PlayerSetupProps) {
  const [mode, setMode] = useState<GameMode | null>(null);
  // Set once the mode and player count are settled — the point at which the
  // table is known and there are names to ask for.
  const [naming, setNaming] = useState<{
    numPlayers: number;
    mode: GameMode;
  } | null>(null);

  useEffect(() => {
    if (mode === "elimination" && !naming) speak("howManyPlayers");
  }, [mode, naming]);

  function askNames(numPlayers: number, chosen: GameMode) {
    setMode(chosen);
    setNaming({ numPlayers, mode: chosen });
  }

  if (naming) {
    return (
      <NameSeats
        numPlayers={naming.numPlayers}
        mode={naming.mode}
        onBack={() => {
          // 1v1 skips the player-count step, so its way back is to the modes.
          setMode(naming.mode === "1v1" ? null : "elimination");
          setNaming(null);
        }}
        onStart={onStart}
      />
    );
  }

  // Step 1: choose a game mode.
  if (mode === null) {
    return (
      <div
        className={SCREEN}
        style={{ backgroundImage: "url('/firstpagebackground.jpg')" }}
      >
        <div className={PANEL}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gamelogoatthestart.jpg"
            alt="Whot game logo"
            className="mb-3 h-20 w-20 rounded-2xl object-cover shadow-xl ring-2 ring-amber-400/40"
          />
          <h1 className="text-3xl font-black tracking-tight">WHOT</h1>
          <p className="mt-1 text-center font-bold text-emerald-200">
            Nigerian card game · Elimination tournament
          </p>

          <div className="mt-5 w-full max-w-md rounded-2xl border border-white/10 bg-black/90 p-5">
            <h2 className="text-center text-lg font-bold text-emerald-100">
              Choose a game mode
            </h2>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => {
                  speak("mode1v1");
                  askNames(2, "1v1");
                }}
                className="w-full rounded-xl border border-amber-400/40 bg-emerald-700/40 p-3 text-left transition hover:scale-[1.02] hover:bg-emerald-600/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-black">⚔️ 1 v 1</span>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-amber-300">
                    Quick match
                  </span>
                </div>
                <p className="mt-1 text-sm text-emerald-200">
                  You vs one bot. First to empty their hand wins the match.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  speak("modeElimination");
                  setMode("elimination");
                }}
                className="w-full rounded-xl border border-emerald-400/40 bg-emerald-700/40 p-3 text-left transition hover:scale-[1.02] hover:bg-emerald-600/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-black">🏆 Elimination</span>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-amber-300">
                    Tournament
                  </span>
                </div>
                <p className="mt-1 text-sm text-emerald-200">
                  2–4 players. Highest hand is eliminated each round until one
                  champion remains.
                </p>
              </button>

              <button
                type="button"
                onClick={onNearby}
                className="w-full rounded-xl border border-sky-400/40 bg-sky-700/30 p-3 text-left transition hover:scale-[1.02] hover:bg-sky-600/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-black">📱 Friends nearby</span>
                  <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-sky-200">
                    No internet
                  </span>
                </div>
                <p className="mt-1 text-sm text-emerald-200">
                  2–4 people, a phone each. Same Wi-Fi or hotspot, paired by
                  scanning a code.
                </p>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onSettings}
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
              >
                ⚙️ Settings
              </button>
              <InstallButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2 (elimination only): choose the number of players.
  return (
    <div
      className={SCREEN}
      style={{ backgroundImage: "url('/firstpagebackground.jpg')" }}
    >
      <div className={PANEL}>
        <div className="mb-2 text-4xl">🏆</div>
        <h1 className="text-3xl font-black tracking-tight">WHOT</h1>
        <p className="mt-1 text-emerald-200">Elimination tournament</p>

        <div className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-black/20 p-5">
          <button
            type="button"
            onClick={() => setMode(null)}
            className="mb-3 text-sm font-semibold text-emerald-300 transition hover:text-emerald-100"
          >
            ← Back to modes
          </button>

          <h2 className="text-center text-lg font-bold text-emerald-100">
            How many players?
          </h2>
          <p className="mt-1 text-center text-sm text-emerald-200/80">
            You take the first seat. The rest are bots.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 p-3">
            {OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => askNames(n, "elimination")}
                aria-pressed={n === defaultPlayers}
                className={`rounded-xl py-3 text-xl font-black transition hover:scale-105 ${
                  n === defaultPlayers
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : "border border-white/20 text-emerald-200 hover:bg-white/10"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-4 text-sm text-emerald-100">
            <div className="font-bold text-emerald-300">How it works</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Play Whot until one player empties their hand each round.</li>
              <li>
                The round winner is safe. The other players&apos; hand totals
                are compared.
              </li>
              <li>
                The player with the <b>highest</b> total is eliminated.
              </li>
              <li>
                Remaining players start a new round — until only one player
                remains as the champion.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NameSeatsProps {
  numPlayers: number;
  mode: GameMode;
  onBack: () => void;
  onStart: (numPlayers: number, mode: GameMode, seats: Seat[]) => void;
}

/** Step 3: name everyone at the table. */
function NameSeats({ numPlayers, mode, onBack, onStart }: NameSeatsProps) {
  const [names, setNames] = useState<string[]>(() => {
    const saved = storedNames();
    return Array.from(
      { length: numPlayers },
      (_, i) => saved[i] ?? defaultName(i),
    );
  });

  function submit() {
    // A blank field means "this one can be called whatever", so it falls back
    // to the seat default rather than holding the game up over an empty box.
    const seats: Seat[] = names.map((raw, i) => ({
      name: raw.trim().slice(0, MAX_NAME) || fallbackName(i),
      isHuman: i === 0,
    }));
    try {
      localStorage.setItem(STORE, JSON.stringify(seats.map((s) => s.name)));
    } catch {
      // Names just will not be remembered next time; the game is unaffected.
    }
    onStart(numPlayers, mode, seats);
  }

  return (
    <div
      className={SCREEN}
      style={{ backgroundImage: "url('/firstpagebackground.jpg')" }}
    >
      <div className="m-auto flex w-full max-w-md flex-col items-center p-4">
        <h1 className="text-3xl font-black tracking-tight">WHOT</h1>
        <p className="mt-1 text-emerald-200">
          {mode === "1v1" ? "1 v 1 match" : "Elimination tournament"}
        </p>

        <form
          className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-black/60 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-sm font-semibold text-emerald-300 transition hover:text-emerald-100"
          >
            ← Back
          </button>

          <h2 className="text-center text-lg font-bold text-emerald-100">
            Who is playing?
          </h2>
          <p className="mt-1 text-center text-sm text-emerald-200/80">
            Tap past any you are happy with.
          </p>

          <div className="mt-4 space-y-2">
            {names.map((name, i) => (
              <label key={i} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm font-semibold text-emerald-300">
                  {i === 0 ? "You" : `Bot ${i}`}
                </span>
                <input
                  value={name}
                  onChange={(event) => {
                    const next = [...names];
                    next[i] = event.target.value;
                    setNames(next);
                  }}
                  maxLength={MAX_NAME}
                  placeholder={i === 0 ? "Your name" : defaultName(i)}
                  aria-label={i === 0 ? "Your name" : `Bot ${i} name`}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/40 px-3 py-2 font-semibold text-white placeholder:text-emerald-200/40 focus:border-amber-400 focus:outline-none"
                />
              </label>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              type="submit"
              className="mt-5 items-center rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
            >
              Deal the cards →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
