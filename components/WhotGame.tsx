"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, GameMode, Shape } from "@/lib/types";
import type { GameState } from "@/lib/gameLogic";
import {
  initGame,
  canPlay,
  playCard,
  playCards,
  drawCard,
  chooseAiCard,
  endTurn,
  nextRound,
  handValue,
  ruleMessage,
} from "@/lib/gameLogic";
import ClassDiscardPile from "./DiscardPile";
import DeckCard from "./DeckCard";
import FaceDownCard from "./FaceDownCard";
import PlayerHand from "./PlayerHand";
import PlayerSetup from "./PlayerSetup";
import ShapePicker from "./ShapePicker";
import { describeShape } from "@/lib/describe";
import { playSound } from "@/lib/sound";

export default function WhotGame() {
  const [config, setConfig] = useState<{
    numPlayers: number;
    mode: GameMode;
  } | null>(null);

  // Show the setup screen (mode + player count) first.
  if (config === null) {
    return (
      <PlayerSetup
        onStart={(numPlayers, mode) => setConfig({ numPlayers, mode })}
      />
    );
  }

  return (
    <GameBoard
      key={`${config.mode}-${config.numPlayers}`}
      numPlayers={config.numPlayers}
      mode={config.mode}
      onQuit={() => setConfig(null)}
    />
  );
}

interface BotAreaProps {
  name: string;
  count: number;
  isTurn: boolean;
  maxCards?: number;
}

const MAX_VISIBLE = 8;
const CARDS_PER_ROW = 5;
// How long to wait after the last selection before auto-playing the
// selected card(s). Lets the player chain multiple same-numbered cards.
const COMMIT_DELAY = 700;

function BotArea({ name, count, isTurn, maxCards }: BotAreaProps) {
  const visibleCount = Math.min(count, maxCards ?? MAX_VISIBLE);
  const rows: number[][] = [];
  const arr = Array.from({ length: visibleCount }, (_, i) => i);
  for (let i = 0; i < arr.length; i += CARDS_PER_ROW) {
    rows.push(arr.slice(i, i + CARDS_PER_ROW));
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
          isTurn
            ? "border-amber-400 bg-emerald-700/60"
            : "border-white/10 bg-white/5"
        }`}
      >
        <span className="text-sm font-semibold">{name}</span>
        {isTurn && <span className="ml-0.5 text-amber-300">●</span>}
        <span className="ml-1 text-xs text-emerald-200">({count})</span>
      </div>
      {isTurn && (
        <div className="animate-pulse text-xs font-semibold text-amber-300">
          ▶ thinking...
        </div>
      )}
      <div className="flex flex-col items-center gap-1">
        {rows.map((row, r) => (
          <div key={r} className="flex flex-wrap justify-center gap-0.5">
            {row.map((_, i) => (
              <FaceDownCard key={i} size="md" rotate={0} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface GameBoardProps {
  numPlayers: number;
  mode: GameMode;
  onQuit: () => void;
}

function GameBoard({ numPlayers, mode, onQuit }: GameBoardProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [pendingShape, setPendingShape] = useState(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs mirror the selection state so the auto-commit timer never reads a
  // stale closure (the user may chain several cards before the timer fires).
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const selectedValueRef = useRef<number | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const [rulePause, setRulePause] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  // Initialize the game only after mount (client-side) so Math.random()
  // doesn't cause a hydration mismatch.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setGame(initGame(numPlayers, mode));
      playSound("start");
    });
    return () => cancelAnimationFrame(id);
  }, [numPlayers, mode]);

  function triggerPopup(cards: Card[]) {
    const last = cards[cards.length - 1];
    const msg = ruleMessage(last);
    if (!msg) return;
    setPopup(msg);
    window.setTimeout(() => setPopup(null), 2200);
  }

  // AI turn handling
  useEffect(() => {
    if (!game) return;
    if (game.gameOver || game.roundOver) return;
    if (pendingShape) return;
    if (isPaused) return;
    const player = game.players[game.currentPlayerIndex];
    if (!player || player.isHuman) return;

    const delay = rulePause ? 3200 : 2000;
    const timer = setTimeout(() => {
      // During a "5 challenge", the AI may play a 5 to escape the draw-3
      // penalty (passing it along). If it has one, play it; otherwise it
      // draws the 3 penalty cards.
      if (game.fiveResponse) {
        const five = player.hand.find((c) => c.value === 5);
        if (five) {
          const next = playCard(game, game.currentPlayerIndex, five);
          setGame(() => next);
          triggerPopup([five]);
          return;
        }
        const next = drawCard(game, game.currentPlayerIndex);
        setGame(() => next);
        return;
      }

      const card = chooseAiCard(
        player.hand,
        game.topCard,
        undefined,
        game.holdAll,
      );
      if (card) {
        if (card.shape === "whot") {
          const shapes: Shape[] = [
            "circle",
            "cross",
            "square",
            "star",
            "triangle",
          ];
          const chosen = shapes[Math.floor(Math.random() * shapes.length)];
          const next = playCard(game, game.currentPlayerIndex, card, chosen);
          setGame(() => next);
          triggerPopup([card]);
        } else {
          const next = playCard(game, game.currentPlayerIndex, card);
          setGame(() => next);
          triggerPopup([card]);
        }
      } else {
        const next = drawCard(game, game.currentPlayerIndex);
        setGame(() => next);
        playSound("drawCard");
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [game, pendingShape, rulePause, isPaused]);

  // Play a sound whenever a card is played (by anyone). We detect this by
  // watching the top card change while the round is still active.
  const prevTopRef = useRef<{ id: string; value: number | null } | null>(null);
  useEffect(() => {
    if (!game) return;
    const key = game.topCard.id;
    const prev = prevTopRef.current;
    if (prev && prev.id !== key && !game.gameOver) {
      playSound("playCard");
      // If the played card forces the next player to draw 2 or 3 cards
      // (value 2 or 5), play the penalty draw sound — but only when the
      // USER (player 0) is the one who must draw.
      const n = game.players.length;
      const prevPlayerIdx = game.currentPlayerIndex;
      const nextIdx = (prevPlayerIdx + game.direction + n) % n;
      const isUserPenalized = game.players[nextIdx]?.isHuman;
      if (
        isUserPenalized &&
        (game.topCard.value === 2 || game.topCard.value === 5)
      ) {
        playSound("drawPenalty");
      }
    }
    prevTopRef.current = { id: key, value: game.topCard.value };
  }, [game]);

  // Play the "level win" sound when a round ends in elimination mode.
  const prevRoundOverRef = useRef(false);
  useEffect(() => {
    if (!game) return;
    if (
      game.roundOver &&
      !prevRoundOverRef.current &&
      game.mode === "elimination"
    ) {
      playSound("levelWin");
    }
    prevRoundOverRef.current = game.roundOver;
  }, [game]);

  // Play win/lose sound when the game ends.
  const prevOverRef = useRef(false);
  useEffect(() => {
    if (!game) return;
    if (game.gameOver && !prevOverRef.current) {
      const youWon = game.players[0].active && game.winnerIndex === 0;
      playSound(youWon ? "win" : "lose");
    }
    prevOverRef.current = game.gameOver;
  }, [game]);

  // All hooks above. Now guard for null game before rendering handlers.
  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white">
        <div className="animate-pulse text-xl font-semibold">
          Shuffling the deck...
        </div>
      </div>
    );
  }

  const g = game; // non-null local alias for the handler closures
  const currentPlayer = g.players[g.currentPlayerIndex];
  const isHumanTurn =
    currentPlayer?.isHuman && !g.gameOver && !g.roundOver && !isPaused;

  const effectiveShape: Shape = g.topCard.shape;

// Compute playable cards for the human player
  const humanPlayable = new Set<string>();
  if (isHumanTurn && !pendingShape) {
    if (g.fiveResponse) {
      // Responding to a 5: the only way to escape is to play another 5.
      g.players[0].hand.forEach((c) => {
        if (c.value === 5) humanPlayable.add(c.id);
      });
    } else if (g.holdAll) {
      g.players[0].hand.forEach((c) => humanPlayable.add(c.id));
    } else {
      g.players[0].hand.forEach((c) => {
        if (canPlay(c, g.topCard)) humanPlayable.add(c.id);
      });
    }
  }

  function isRulePlay(cards: Card[]): boolean {
    if (cards.length > 1) return true;
    const c = cards[0];
    if (c.shape === "whot") return true;
    return c.value === 1 || c.value === 14;
  }

  // Commit the currently selected cards (if any) to the table.
  function commitSelection() {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const cards = g.players[0].hand.filter((c) => ids.has(c.id));
    if (cards.length === 0) return;

    const last = cards[cards.length - 1];
    if (last.shape === "whot") {
      setPendingShape(true);
      return;
    }

    const next =
      cards.length === 1 ? playCard(g, 0, cards[0]) : playCards(g, 0, cards);
    setGame(() => next);
    setSelectedIds(new Set());
    setSelectedValue(null);
    selectedIdsRef.current = new Set();
    selectedValueRef.current = null;
    triggerPopup(cards);
    setRulePause(isRulePlay(cards));
  }

  // Called whenever a card is clicked on the human's turn.
  function handleSelect(card: Card) {
    if (!isHumanTurn || pendingShape) return;

    // During "Hold All" any card is playable; otherwise it must match.
    // A same-numbered card is also allowed once a group of that number is
    // already selected (even if its shape doesn't match the top card).
    const groupingSameValue =
      selectedValueRef.current !== null &&
      selectedValueRef.current === card.value &&
      selectedIdsRef.current.size > 0;
    if (!g.holdAll && !humanPlayable.has(card.id) && !groupingSameValue) return;

    if (card.shape === "whot") {
      // Whot: immediately enter shape selection for this single card.
      if (submitTimer.current) {
        clearTimeout(submitTimer.current);
        submitTimer.current = null;
      }
      setSelectedIds(new Set([card.id]));
      setSelectedValue(null);
      selectedIdsRef.current = new Set([card.id]);
      selectedValueRef.current = null;
      setPendingShape(true);
      return;
    }

    const value = card.value;

    // Multi-play rule: only group cards of the same number.
    // If we already have a pending same-value group, add to it.
    const curIds = selectedIdsRef.current;
    const curValue = selectedValueRef.current;
    if (curValue !== null && curValue === value && !curIds.has(card.id)) {
      const nextIds = new Set([...curIds, card.id]);
      setSelectedIds(nextIds);
      selectedIdsRef.current = nextIds;
    } else {
      // Starting a new selection (or switching to a different number).
      setSelectedIds(new Set([card.id]));
      setSelectedValue(value);
      selectedIdsRef.current = new Set([card.id]);
      selectedValueRef.current = value;
    }

    // Reset the auto-commit timer so the player can quickly chain more
    // same-numbered cards. When it fires, play the whole group at once.
    if (submitTimer.current) {
      clearTimeout(submitTimer.current);
      submitTimer.current = null;
    }
    submitTimer.current = setTimeout(() => {
      submitTimer.current = null;
      commitSelection();
    }, COMMIT_DELAY);
  }

  function handleDraw() {
    if (!isHumanTurn || pendingShape) return;
    if (submitTimer.current) clearTimeout(submitTimer.current);
    const next = drawCard(g, 0);
    setGame(() => next);
    setSelectedIds(new Set());
    setSelectedValue(null);
    playSound("drawCard");
  }

  function handleEndHoldAll() {
    if (!isHumanTurn || pendingShape) return;
    if (submitTimer.current) clearTimeout(submitTimer.current);
    const next = endTurn(g, 0);
    setGame(() => next);
    setSelectedIds(new Set());
  }

  function handleShapePick(shape: Shape) {
    if (selectedIds.size === 0) return;
    const cards = g.players[0].hand.filter((c) => selectedIds.has(c.id));
    if (cards.length === 0) return;
    const next = playCards(g, 0, cards, shape);
    setGame(() => next);
    setSelectedIds(new Set());
    setPendingShape(false);
    triggerPopup(cards);
    setRulePause(isRulePlay(cards));
  }

  function handleNextRound() {
    setGame(() => nextRound(g));
    setSelectedIds(new Set());
    setPendingShape(false);
  }

  function restart() {
    if (submitTimer.current) clearTimeout(submitTimer.current);
    setGame(() => initGame(numPlayers, mode));
    setSelectedIds(new Set());
    setPendingShape(false);
  }

  function handlePause() {
    if (g.gameOver || g.roundOver) return;
    setIsPaused((p) => !p);
    if (submitTimer.current) clearTimeout(submitTimer.current);
  }

  function handleResume() {
    setIsPaused(false);
  }

  function handleQuit() {
    if (submitTimer.current) clearTimeout(submitTimer.current);
    onQuit();
  }

  const winner = g.winnerIndex !== null ? g.players[g.winnerIndex] : null;
  // Players still in the tournament
  const activePlayers = g.players.filter((p) => p.active);
  // The round winner (safe from elimination)
  const roundWinner =
    g.roundWinnerIndex !== null ? g.players[g.roundWinnerIndex] : null;

// Status hint shown on the human's turn.
  let humanHint =
    "Your turn — play a matching card or draw. Click same-numbered cards together!";
  if (g.fiveResponse) {
    humanHint =
      "Play a 5 to pass on the draw-3 penalty — or draw 3 cards. Your choice!";
  } else if (g.holdAll) {
    humanHint = "Hold All! You may play any card. Click 'End Turn' when done.";
  } else if (selectedValue !== null && selectedIds.size > 0) {
    const totalOfValue = g.players[0].hand.filter(
      (c) => c.value === selectedValue,
    ).length;
    if (selectedIds.size < totalOfValue) {
      humanHint = `Selecting ${selectedIds.size} × ${selectedValue}s — click more of the same number, or wait to play.`;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-emerald-900 via-emerald-800 to-teal-900 p-4 text-white">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">WHOT 🃏</h1>
        <div className="text-sm text-emerald-200">
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold uppercase text-amber-300">
            {g.mode === "1v1" ? "1 v 1" : "Elimination"}
          </span>
          {" · "}Round{" "}
          <span className="font-bold text-white">{g.roundNumber}</span> ·
          Players{" "}
          <span className="font-bold text-white">{activePlayers.length}</span> ·{" "}
          Deck: <span className="font-bold text-white">{g.deck.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {!g.gameOver && !g.roundOver && (
            <button
              type="button"
              onClick={handlePause}
              className="rounded-lg border border-white/20 px-3 py-1 text-sm font-semibold transition hover:bg-white/10"
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
          <button
            type="button"
            onClick={restart}
            className="rounded-lg border border-white/20 px-3 py-1 text-sm font-semibold transition hover:bg-white/10"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={() => setConfirmQuit(true)}
            className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-200 transition hover:bg-red-500/40"
          >
            Quit
          </button>
        </div>
      </header>

      {/* Bots row */}
      <div className="flex flex-wrap items-start justify-center gap-6">
        {g.players
          .filter((p) => !p.isHuman && p.active)
          .map((p, idx) => (
            <BotArea
              key={`${p.name}-${idx}`}
              name={p.name}
              count={p.hand.length}
              isTurn={
                g.currentPlayerIndex === g.players.indexOf(p) &&
                !g.gameOver &&
                !g.roundOver
              }
            />
          ))}
      </div>

      {/* Center: discard pile + deck */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <div className="flex items-start justify-center gap-10">
          {g.topCard && <ClassDiscardPile topCard={g.topCard} />}
          <button
            type="button"
            onClick={handleDraw}
            disabled={!isHumanTurn || pendingShape}
            title={isHumanTurn ? "Click to draw a card" : ""}
            className="relative h-40 w-28 rounded-xl transition hover:scale-105 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <DeckCard count={g.deck.length} />
          </button>
        </div>

        {/* Status text */}
        <div className="flex flex-col items-center gap-1 text-sm text-emerald-200">
          <div>
            Current shape:{" "}
            <span className="font-bold text-white">
              {describeShape(effectiveShape)}
            </span>
          </div>
          {!isHumanTurn && !g.gameOver && !g.roundOver && (
            <div className="animate-pulse text-sm text-amber-300">
              {currentPlayer?.name} is thinking...
            </div>
          )}
          {isHumanTurn && !g.gameOver && !g.roundOver && (
            <div className="text-sm text-emerald-200">{humanHint}</div>
          )}
        </div>
      </div>

      {/* Human hand */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">
            Your hand ({g.players[0].hand.length})
          </span>
          {isHumanTurn && !pendingShape && g.holdAll && (
            <button
              type="button"
              onClick={handleEndHoldAll}
              className="rounded-lg bg-amber-500 px-3 py-1 text-sm font-bold text-white transition hover:bg-amber-400"
            >
              End Turn
            </button>
          )}
          <span className="text-xs text-emerald-200">
            Click a card to play it.
          </span>
        </div>
        <PlayerHand
          cards={g.players[0].hand}
          isActive={isHumanTurn && !pendingShape}
          isHuman
          playableIds={humanPlayable}
          selectedIds={selectedIds}
          selectedValue={selectedValue}
          onSelect={handleSelect}
        />
      </div>

      {/* Shape picker modal */}
      {pendingShape && (
        <ShapePicker
          onPick={(shape) => {
            handleShapePick(shape);
          }}
        />
      )}

      {/* Centered rule popup */}
      {popup && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
          <div className="rule-pop rounded-2xl border-2 border-amber-400 bg-emerald-900/95 px-8 py-5 text-center shadow-2xl">
            <div className="text-2xl font-black text-amber-300">⚡ Rule!</div>
            <div className="mt-1 max-w-xs text-sm font-semibold text-white">
              {popup}
            </div>
          </div>
        </div>
      )}

      {/* Round over overlay */}
      {g.roundOver && !g.gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
            <div className="text-4xl mb-2">🎉</div>
            <h2 className="text-2xl font-black">
              {roundWinner?.isHuman
                ? "You won the round!"
                : `${roundWinner?.name} won the round!`}
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Round {g.roundNumber} is complete.{" "}
              {g.mode === "1v1"
                ? "You emptied your hand first — you win the match!"
                : "The player with the highest hand value is eliminated."}
            </p>

            {/* All player hand values */}
            {g.mode !== "1v1" && (
              <div className="mt-6 space-y-3">
                {g.players
                  .filter((p) => p.active)
                  .map((p, i) => {
                    const total = handValue(p.hand);
                    const isWinner = p.name === roundWinner?.name;
                    // The eliminated player is the highest hand among the
                    // active non-winners.
                    const isEliminated =
                      !isWinner &&
                      p.hand.length > 0 &&
                      total ===
                        Math.max(
                          ...g.players
                            .filter(
                              (q) =>
                                q.active &&
                                q.name !== roundWinner?.name &&
                                q.hand.length > 0,
                            )
                            .map((q) => handValue(q.hand)),
                        );
                    return (
                      <div
                        key={i}
                        className={`rounded-xl border p-3 text-left ${
                          isEliminated
                            ? "border-red-400 bg-red-50"
                            : isWinner
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">
                            {p.name}
                            {isWinner && " 🏆"}
                            {isEliminated && " ❌"}
                          </span>
                          <span className="text-sm font-semibold text-zinc-600">
                            Hand value: {total}
                          </span>
                        </div>
                        {isWinner && (
                          <div className="mt-1 text-xs font-semibold text-emerald-600">
                            Round winner — safe!
                          </div>
                        )}
                        {isEliminated && (
                          <div className="mt-1 text-xs font-semibold text-red-600">
                            ⛔ {p.name} is eliminated — highest hand value!
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            <button
              type="button"
              onClick={handleNextRound}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
            >
              {g.mode === "1v1" ? "See Result 🏆" : "Eliminate & Next Round →"}
            </button>
          </div>
        </div>
      )}

      {/* Game over: human was eliminated (elimination mode) */}
      {g.gameOver &&
        g.mode === "elimination" &&
        winner &&
        !winner.isHuman &&
        !g.players[0].active && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white
              p-8 text-center text-zinc-900 shadow-2xl"
            >
              <div className="text-6xl mb-2">💀</div>
              <h2 className="text-3xl font-black text-red-600">
                You&apos;ve Been Eliminated!
              </h2>
              <p className="mt-2 text-zinc-600">
                You had the highest hand total this round, so you were
                eliminated from the tournament.
                {g.lastElimination && (
                  <>
                    {" "}
                    Your hand value was <b>{g.lastElimination.total}</b>.
                  </>
                )}
              </p>

              <div className="mt-6 space-y-2 text-left">
                {g.players.map((p, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 ${
                      p.isHuman
                        ? "border-red-300 bg-red-50"
                        : i === g.winnerIndex
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-zinc-200 bg-zinc-50 opacity-70"
                    }`}
                  >
                    <span className="font-bold">
                      {p.name}
                      {p.isHuman && !p.active && " (eliminated) ❌"}
                      {i === g.winnerIndex && " 🏆"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={restart}
                  className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
                >
                  ↻ Play Again
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmQuit(true)}
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-6 py-3 font-bold text-zinc-700 transition hover:bg-zinc-100"
                >
                  Quit to Menu
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Overall winner screen (hidden when the human was eliminated, which
      has its own dedicated game-over screen above) */}
      {g.gameOver &&
        winner &&
        !(g.mode === "elimination" && !g.players[0].active) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
              <div className="text-6xl mb-2">🏆</div>
              <h2 className="text-3xl font-black">
                {winner.isHuman
                  ? g.mode === "1v1"
                    ? "You win the 1v1 match!"
                    : "You are the Champion!"
                  : g.mode === "1v1"
                    ? `${winner.name} wins the 1v1 match!`
                    : `${winner.name} is the Champion!`}
              </h2>
              <p className="mt-2 text-zinc-600">
                {g.mode === "1v1"
                  ? winner.isHuman
                    ? "You emptied your hand first. Well played!"
                    : "Your opponent emptied their hand first. Better luck next time!"
                  : winner.isHuman
                    ? "You survived every round and won the tournament!"
                    : "The last player standing. Better luck next time!"}
              </p>

              <div className="mt-6 space-y-2 text-left">
                {g.players.map((p, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 ${
                      i === g.winnerIndex
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50 opacity-70"
                    }`}
                  >
                    <span className="font-bold">
                      {p.name}
                      {i === g.winnerIndex && " 🏆"}
                      {!p.active && i !== g.winnerIndex && " (eliminated)"}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={restart}
                className="mt-6 w-full rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
              >
                Play Again
              </button>
            </div>
          </div>
        )}

      {/* Pause overlay */}
      {isPaused && !g.gameOver && !g.roundOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
            <div className="text-5xl mb-3">⏸️</div>
            <h2 className="text-2xl font-black">Game Paused</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Take a break — the game will wait for you.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleResume}
                className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
              >
                ▶ Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPaused(false);
                  setConfirmQuit(true);
                }}
                className="w-full rounded-xl border border-red-300 bg-red-50 px-6 py-3 font-bold text-red-600 transition hover:bg-red-100"
              >
                Quit to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quit confirmation modal */}
      {confirmQuit && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
            <div className="text-5xl mb-3">🚪</div>
            <h2 className="text-2xl font-black">Quit Game?</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Your current progress will be lost and you will return to the main
              menu.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleQuit}
                className="w-full rounded-xl bg-red-600 px-6 py-3 font-bold text-white transition hover:bg-red-500"
              >
                Yes, Quit to Menu
              </button>
              <button
                type="button"
                onClick={() => setConfirmQuit(false)}
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-6 py-3 font-bold text-zinc-700 transition hover:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
