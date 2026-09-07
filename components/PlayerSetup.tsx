"use client";

import { useState } from "react";
import type { GameMode } from "@/lib/types";
import InstallButton from "./InstallButton";

interface PlayerSetupProps {
  onStart: (numPlayers: number, mode: GameMode) => void;
}

const OPTIONS = [2, 3, 4];

// The screen is the frame, which never scrolls itself, so the setup panel
// scrolls instead. m-auto rather than justify-center: it centres the panel when
// there is room to spare and gives way to scrolling when there isn't, where
// justify-center would clip the top off and put it out of reach.
const SCREEN = "flex h-full flex-col overflow-y-auto bg-cover bg-center text-white";
const PANEL = "m-auto flex w-full flex-col items-center p-4";

export default function PlayerSetup({ onStart }: PlayerSetupProps) {
  const [mode, setMode] = useState<GameMode | null>(null);

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
                  setMode("1v1");
                  onStart(2, "1v1");
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
                onClick={() => setMode("elimination")}
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
            </div>

            <div className="mt-4 flex justify-center border-t border-white/10 pt-4">
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
            You are Player 1. The rest are bots.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onStart(n, "elimination")}
                className="rounded-xl bg-emerald-600 py-3 text-xl font-black text-white transition hover:scale-105 hover:bg-emerald-500"
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
