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
  multiPlayLabel,
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
  // "top" = horizontal (name on top, cards fanning down toward center).
  // "left" = standing sideways, cards face inward (right), name against wall (left).
  // "right" = standing sideways, cards face inward (left), name against wall (right).
  side?: "top" | "left" | "right";
  singleRow?: boolean; // if true, don't wrap cards into multiple rows
}

const MAX_VISIBLE = 8;
// A side player stands in a narrow strip beside the table, so they show a
// single column of cards however many they are holding.
const SIDE_VISIBLE = 5;
const CARDS_PER_ROW = 5;
// How long to wait after the last selection before auto-playing the
// selected card(s). Lets the player chain multiple same-numbered cards.
const COMMIT_DELAY = 700;

function BotArea({
  name,
  count,
  isTurn,
  maxCards,
  side = "top",
  singleRow = false,
}: BotAreaProps) {
  const isSide = side === "left" || side === "right";
  const visibleCount = Math.min(
    count,
    maxCards ?? (isSide ? SIDE_VISIBLE : MAX_VISIBLE),
  );
  const rows: number[][] = [];
  const arr = Array.from({ length: visibleCount }, (_, i) => i);
  const rowSize = singleRow ? visibleCount : CARDS_PER_ROW;
  for (let i = 0; i < arr.length; i += rowSize) {
    rows.push(arr.slice(i, i + rowSize));
  }

  // Side bots stand sideways: their cards are rotated to face the center
  // (90° inward), and their name label sits against the outer wall.
  const cardRotate = side === "left" ? 90 : -90;

  // Name pill: for the left bot it sits on the left against the wall; for the
  // right bot (A) it sits on the right against the wall. The card area is
  // placed on the opposite side so the cards face inward.
  //
  // A side bot's name reads down the wall rather than across it. writing-mode
  // turns the text without a transform, and that is what keeps the pill's box
  // the shape it looks — a narrow column — so it costs the table only the
  // width it really occupies. A rotated pill still reserves its full
  // horizontal width, which is what used to push the side players off screen.
  const namePill = (
    <div
      className={`flex items-center gap-1 rounded-lg border ${
        isSide ? "[writing-mode:vertical-rl] px-1 py-2" : "px-2 py-1"
      } ${
        isTurn
          ? "border-amber-400 bg-emerald-700/60"
          : "border-white/10 bg-white/5"
      }`}
    >
      <span className="text-sm font-semibold whitespace-nowrap">{name}</span>
      {isTurn && <span className="text-amber-300">●</span>}
      <span className="text-xs text-emerald-200">({count})</span>
    </div>
  );

  // Card area: for side bots the 5-card columns sit side by side (column gap)
  // with the cards packed tightly within each column (row gap); for the top
  // bot cards wrap in rows. Side bots (A & C) get a wider column gap.
  const cardArea = (
    <div
      className={`flex items-center ${
        isSide ? "flex-row space-x-7" : "flex-col space-y-1"
      }`}
    >
      {rows.map((row, r) => (
        <div
          key={r}
          className={`flex justify-center space-x-0 ${
            // A side player's column has to fit inside the height of the table
            // beside the pile, so their cards sit further over each other than
            // the top player's — that row has the width to spread out in.
            // flex-nowrap because the column is stretched to the row's height:
            // allowed to wrap, it would spill into a second column.
            isSide
              ? "flex-col flex-nowrap -space-y-10"
              : "flex-row flex-wrap -space-y-6"
          }`}
        >
          {row.map((_, i) => (
            <FaceDownCard key={i} size="xl" rotate={isSide ? cardRotate : 0} />
          ))}
        </div>
      ))}
    </div>
  );

  // For the right (A) bot the name goes on the right and the cards on the left;
  // for the top and left bots the name comes first (top/left).
  const showNameFirst = side === "left" || side === "top";

  return (
    <div
      className={`flex shrink-0 items-center gap-2 ${
        isSide ? "flex-row" : "flex-col"
      }`}
    >
      {showNameFirst && namePill}
      {/* {isTurn && (
        <div className="animate-pulse text-xs font-semibold text-amber-300">
          ▶ thinking...
        </div>
      )} */}
      {cardArea}
      {!showNameFirst && namePill}
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
  const [popup, setPopup] = useState<{
    title: string;
    text: string;
    detail?: string;
  } | null>(null);
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

  // `rejecting` is true when these cards are played in answer to a pending 5
  // challenge — a single 5, or a double/triple of 5s, cancels the pick 3.
  function triggerPopup(cards: Card[], rejecting = false) {
    const count = cards.length;
    const last = cards[count - 1];
    const isRejection = rejecting && last.value === 5;
    const msg = ruleMessage(last, { rejecting, count });

    // A double/triple (or more) of the same number is worth announcing on its
    // own, even when the number carries no special rule. The rejection message
    // already names the double/triple, so it keeps its own headline.
    if (count > 1 && !isRejection) {
      const label = multiPlayLabel(count);
      const number = last.value !== null ? `${last.value}s` : "Whots";
      setPopup({
        title: `🃏 ${label}!`,
        text: `${label} ${number} played together!`,
        detail: msg ?? undefined,
      });
      window.setTimeout(() => setPopup(null), 2200);
      return;
    }

    if (!msg) return;
    setPopup({
      title: isRejection ? "🚫 Rejected!" : "⚡ Rule!",
      text: msg,
    });
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
          triggerPopup([five], true);
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
      // (value 2 or 5), play the penalty draw sound — but ONLY when the
      // USER (player 0) is the one who must draw. Bots never trigger it.
      const n = game.players.length;
      const value = game.topCard.value;
      if (value === 2 || value === 5) {
        // After a 2 is played the turn has already skipped past the
        // penalized player, so walk one step back to find them. After a 5
        // is played the turn is ON the penalized player, so they are the
        // current player.
        // const penalizedIdx =
        //   value === 2
        //     ? (game.currentPlayerIndex - game.direction + n) % n
        //     : game.currentPlayerIndex;
        // if (game.players[penalizedIdx]?.isHuman) {
        //   playSound("drawPenalty");
        // }
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
      <div className="flex h-full items-center justify-center bg-linear-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white">
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

  // Rebuilds the selected cards in the order the player clicked them. A Set
  // preserves insertion order, so the last card selected stays last in the
  // array — and playCard/playCards make that one the new top card.
  function selectedCardsInOrder(ids: Set<string>): Card[] {
    const byId = new Map(g.players[0].hand.map((c) => [c.id, c]));
    return [...ids]
      .map((id) => byId.get(id))
      .filter((c): c is Card => c !== undefined);
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
    const cards = selectedCardsInOrder(ids);
    if (cards.length === 0) return;

    const last = cards[cards.length - 1];
    if (last.shape === "whot") {
      setPendingShape(true);
      return;
    }

    const rejecting = g.fiveResponse;
    const next =
      cards.length === 1 ? playCard(g, 0, cards[0]) : playCards(g, 0, cards);
    setGame(() => next);
    setSelectedIds(new Set());
    setSelectedValue(null);
    selectedIdsRef.current = new Set();
    selectedValueRef.current = null;
    triggerPopup(cards, rejecting);
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
    // If the human is responding to a 5 challenge (e.g. a previous player
    // escaped with their own 5 and passed the draw-3 penalty over), don't
    // use the normal draw sound — use the penalty draw sound instead.
    playSound("drawCard");
    // if (g.fiveResponse) {
    //   playSound("drawPenalty");
    // } else {
    // }
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
    const cards = selectedCardsInOrder(selectedIds);
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
  // Active bots. Assign each bot to a distinct position so a single remaining
  // bot is only ever shown once (avoids the same bot appearing twice).
  // In elimination mode the arrangement starts from the human's RIGHT, so the
  // first bot sits on the right, the second on top, and the third on the left.
  // In 1v1 the single bot goes to the top.
  const bots = g.players.filter((p) => !p.isHuman && p.active);
  const isElim = g.mode === "elimination";
  // The bot shown at the top of the board.
  const topBot = isElim ? (bots[1] ?? null) : (bots[0] ?? null);
  // The bot shown on the right (first bot in elimination, hidden in 1v1).
  const rightBot = isElim ? (bots[0] ?? null) : null;
  // The bot shown on the left.
  const leftBot = bots[2] ?? null;
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
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-cover bg-center p-3 text-white"
      style={{ backgroundImage: "url('/gamebackground.jpg')" }}
    >
      {/* Header */}
      <header className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/replacevercelicon.jpg"
            alt="Whot"
            className="h-7 w-7 rounded-lg object-cover shadow ring-1 ring-white/20"
          />
          WHOT
        </h1>
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

      {/* Positioned game table: human (bottom). In 1v1 the single bot is at
      top. In elimination: bot2 (top), bot1 (right), bot3 (left). */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Top player */}
        <div className="flex shrink-0 justify-center">
          {topBot && (
            <BotArea
              name={topBot.name}
              count={topBot.hand.length}
              isTurn={
                g.currentPlayerIndex === g.players.indexOf(topBot) &&
                !g.gameOver &&
                !g.roundOver
              }
              singleRow
            />
          )}
        </div>

        {/* Middle row: left bot | center pile+deck | right bot */}
        {/* The side slots take the width left over either side of the pile, so
        the two side players sit out against the walls of the table however
        wide the screen is — rather than at a fixed offset that ran off the
        edge of a phone. */}
        <div className="flex min-h-0 flex-1 items-center justify-between gap-2">
          {/* Left bot (hidden in 1v1). Stands sideways, facing inward. */}
          <div className="flex flex-1 items-center justify-start">
            {g.mode !== "1v1" && leftBot && (
              <BotArea
                name={leftBot.name}
                count={leftBot.hand.length}
                side="left"
                isTurn={
                  g.currentPlayerIndex === g.players.indexOf(leftBot) &&
                  !g.gameOver &&
                  !g.roundOver
                }
              />
            )}
          </div>

          {/* Center: discard pile + deck + status */}
          <div className="flex shrink-0 flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-4">
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

          {/* Right bot (hidden in 1v1, where the only bot goes to the top).
          Stands sideways, facing inward. */}
          <div className="flex flex-1 items-center justify-end">
            {g.mode !== "1v1" && rightBot && (
              <BotArea
                name={rightBot.name}
                count={rightBot.hand.length}
                side="right"
                isTurn={
                  g.currentPlayerIndex === g.players.indexOf(rightBot) &&
                  !g.gameOver &&
                  !g.roundOver
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Human hand */}
      <div className="shrink-0">
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
        <div className="pointer-events-none fixed inset-0 z-60 flex items-center justify-center">
          <div className="rule-pop rounded-2xl border-2 border-amber-400 bg-emerald-900/95 px-8 py-5 text-center shadow-2xl">
            <div className="text-2xl font-black text-amber-300">
              {popup.title}
            </div>
            <div className="mt-1 max-w-xs text-sm font-semibold text-white">
              {popup.text}
            </div>
            {popup.detail && (
              <div className="mt-1 max-w-xs text-xs font-medium text-emerald-200">
                {popup.detail}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Round over overlay */}
      {g.roundOver && !g.gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
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
              className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white
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
            <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
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
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-6">
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
