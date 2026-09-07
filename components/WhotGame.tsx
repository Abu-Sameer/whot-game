"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, GameMode, Player, Shape } from "@/lib/types";
import type { GameState, Seat } from "@/lib/gameLogic";
import {
  HAND_SIZE,
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
import type { NearbyGame } from "./NearbyPairing";
import NearbyPairing from "./NearbyPairing";
import type { NetMessage, NetPlay } from "@/lib/netProtocol";
import {
  applyGuestMove,
  HOST_SEAT,
  parseMessage,
  redactFor,
} from "@/lib/netProtocol";
import { describeShape } from "@/lib/describe";
import { playSound } from "@/lib/sound";

type Session =
  | { kind: "local"; numPlayers: number; mode: GameMode; seats: Seat[] }
  | { kind: "nearby"; game: NearbyGame };

/** The table a nearby game is dealt onto: the people first, then bots. */
function nearbySeats(game: NearbyGame): Seat[] {
  const seats: Seat[] = [{ name: game.myName, isHuman: true }];
  for (const guest of game.guests) {
    seats[guest.seat] = { name: guest.name, isHuman: true };
  }
  for (let i = 0; i < game.numPlayers; i++) {
    seats[i] ??= { name: `Player ${i}`, isHuman: false };
  }
  return seats.slice(0, game.numPlayers);
}

export default function WhotGame() {
  const [pairing, setPairing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [lost, setLost] = useState(false);

  // Frames can arrive before the board has mounted and subscribed — the
  // host's opening deal races the guest's board into existence. They queue
  // here until something is listening, so the deal is never the one dropped.
  const listeners = useRef(new Set<(m: NetMessage, from: number) => void>());
  const backlog = useRef<{ message: NetMessage; from: number }[]>([]);

  const deliver = useCallback((raw: unknown, from: number) => {
    const message = parseMessage(raw);
    if (!message) return;
    if (listeners.current.size === 0) {
      backlog.current.push({ message, from });
      return;
    }
    for (const listener of listeners.current) listener(message, from);
  }, []);

  const subscribe = useCallback(
    (handler: (message: NetMessage, from: number) => void) => {
      listeners.current.add(handler);
      const queued = backlog.current;
      backlog.current = [];
      for (const item of queued) handler(item.message, item.from);
      return () => {
        listeners.current.delete(handler);
      };
    },
    [],
  );

  const nearby = session?.kind === "nearby" ? session.game : null;
  // Memoised because the board subscribes on identity: a fresh object every
  // render would tear the subscription down and rebuild it after every move.
  const net = useMemo<NetPlay | undefined>(() => {
    if (!nearby) return undefined;
    return {
      role: nearby.role,
      send: (message) => nearby.host?.send(message),
      publish: (state) => {
        // Each guest is sent the table with only their own cards in it, so no
        // frame ever carries a hand its recipient is not entitled to see.
        for (const guest of nearby.guests) {
          guest.connection.send({
            type: "state",
            state: redactFor(state, guest.seat),
            seat: guest.seat,
          });
        }
      },
      subscribe,
    };
  }, [nearby, subscribe]);

  const leave = useCallback(() => {
    nearby?.host?.close();
    nearby?.guests.forEach((guest) => guest.connection.close());
    listeners.current.clear();
    backlog.current = [];
    setSession(null);
    setPairing(false);
    setLost(false);
  }, [nearby]);

  if (lost) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-emerald-950 p-6 text-center text-white">
        <div className="mb-3 text-5xl">📴</div>
        <h2 className="text-2xl font-black">Lost a player</h2>
        <p className="mt-2 max-w-sm text-sm text-emerald-200">
          A connection dropped — a phone going to sleep or leaving the Wi-Fi
          will do it. The game cannot carry on without everyone.
        </p>
        <button
          type="button"
          onClick={leave}
          className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 font-bold transition hover:bg-emerald-500"
        >
          Back to the menu
        </button>
      </div>
    );
  }

  if (!session) {
    if (pairing) {
      return (
        <NearbyPairing
          onBack={() => setPairing(false)}
          onMessage={deliver}
          onLost={() => setLost(true)}
          onReady={(game) => setSession({ kind: "nearby", game })}
        />
      );
    }
    // Show the setup screen (mode, player count, then names) first.
    return (
      <PlayerSetup
        onStart={(numPlayers, mode, seats) =>
          setSession({ kind: "local", numPlayers, mode, seats })
        }
        onNearby={() => setPairing(true)}
      />
    );
  }

  if (session.kind === "nearby") {
    const game = session.game;
    return (
      <GameBoard
        key={`nearby-${game.role}`}
        numPlayers={game.numPlayers}
        mode={game.mode}
        seats={nearbySeats(game)}
        net={net}
        onQuit={leave}
      />
    );
  }

  return (
    <GameBoard
      // Renaming the table is a new game, so the key deals a fresh round.
      key={`${session.mode}-${session.numPlayers}-${session.seats
        .map((seat) => seat.name)
        .join("|")}`}
      numPlayers={session.numPlayers}
      mode={session.mode}
      seats={session.seats}
      onQuit={leave}
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
  /** True while the round is still being dealt, so arriving cards animate in. */
  dealing?: boolean;
}

/** Whether a play trips a rule worth holding the bots back a moment for. */
function isRulePlay(cards: Card[]): boolean {
  if (cards.length > 1) return true;
  const card = cards[0];
  if (card.shape === "whot") return true;
  return card.value === 1 || card.value === 14;
}

const MAX_VISIBLE = 10;
// A side player stands in a narrow strip beside the table, so they show a
// single column of cards however many they are holding.
const SIDE_VISIBLE = 5;
const CARDS_PER_ROW = 5;
// How long to wait after the last selection before auto-playing the
// selected card(s). Lets the player chain multiple same-numbered cards.
const COMMIT_DELAY = 700;
// Gap between one card being handed out and the next. Fast enough to feel
// like a dealer's hands, slow enough to follow whose card is whose.
const DEAL_STEP = 500;

function BotArea({
  name,
  count,
  isTurn,
  maxCards,
  side = "top",
  singleRow = false,
  dealing = false,
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
        isSide ? "[writing-mode:vertical-rl] px-1 py-1" : "px-2 py-1"
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
              ? "flex-col -space-y-5 flex-nowrap"
              : "flex-row flex-wrap -space-y-6"
          }`}
        >
          {row.map((_, i) => (
            <FaceDownCard
              key={i}
              size="xl"
              rotate={isSide ? cardRotate : 0}
              className={dealing ? "deal-in" : ""}
            />
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
      className={`flex shrink-0 items-center gap-5 ${
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
  // Names and player types for each place, in turn order.
  seats?: Seat[];
  // Present when other phones are in the game. See lib/netProtocol.ts: the
  // host holds the only real state and a guest asks it for everything.
  net?: NetPlay;
}

function GameBoard({ numPlayers, mode, onQuit, seats, net }: GameBoardProps) {
  const [game, setGame] = useState<GameState | null>(null);
  // Which place at the table this device plays. The host always has the first;
  // a guest is told which is theirs by the host, with every frame, so it never
  // has to assume or remember. Nothing below may take the player holding the
  // phone to be players[0].
  const [seat, setSeat] = useState(HOST_SEAT);
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

  const isGuest = net?.role === "guest";

  // Cards go round the table one at a time when a round is dealt, so everyone
  // can watch the hands being shared out instead of finding them already
  // there. `landed` counts how many have been placed: each seat draws only
  // that many of its cards, and the rest are still shown sitting in the deck.
  // Nothing is faked — this is the real deal, played out in the order
  // dealRound used.
  const [landed, setLanded] = useState(0);
  // The deal `landed` belongs to, so fresh cards restart it and an ordinary
  // move does not.
  const dealtId = useRef<string | null>(null);

  // Lets the frame handler read the table as it stands when a frame lands,
  // rather than as it stood when the handler was made.
  const gameRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // Every change to the table goes through here. When hosting, that also means
  // telling the other phones: the host's copy is the only real one, so their
  // screens are always a picture of what has already happened here.
  const commit = useCallback(
    (next: GameState) => {
      setGame(() => next);
      if (net?.role === "host") net.publish(next);
    },
    [net],
  );

  // `rejecting` is true when these cards are played in answer to a pending 5
  // challenge — a single 5, or a double/triple of 5s, cancels the pick 3.
  const triggerPopup = useCallback((cards: Card[], rejecting = false) => {
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
    // Nothing in here changes between renders, so the frame handler below can
    // depend on it without being rebuilt after every move.
  }, []);

  // Cards that have not been dealt out on this screen yet — the opening hand,
  // a new round after an elimination, a restart, or the host's first frame
  // arriving at a guest. Each of those starts the cards moving again, and an
  // ordinary move does not.
  useEffect(() => {
    if (!game) return;
    if (dealtId.current === game.dealId) return;
    dealtId.current = game.dealId;
    setLanded(0);
  }, [game]);

  useEffect(() => {
    if (!game) return;
    const seats = game.players.filter((player) => player.active).length;
    if (landed >= seats * HAND_SIZE) return;
    const id = setTimeout(() => {
      setLanded((count) => count + 1);
      playSound("drawCard");
    }, DEAL_STEP);
    return () => clearTimeout(id);
  }, [game, landed]);

  // Frames from the other phones. As a guest they are the table as the host
  // now has it, along with which seat is mine. Hosting, they are a request
  // from one of the guests — and the host is what decides whether a request is
  // allowed, so each is checked against the state the host actually holds
  // rather than taken as given.
  const handleFrame = useCallback(
    (message: NetMessage, from: number) => {
      if (isGuest) {
        // The host's word on what the table looks like, which is the only one
        // that counts.
        if (message.type !== "state") return;
        setSeat(message.seat);
        setGame(message.state);
        return;
      }
      const current = gameRef.current;
      if (!current) return;
      // What a guest may and may not do lives in lib/netProtocol.ts, beside
      // the wire format it is defending.
      const applied = applyGuestMove(current, message, from);
      if (!applied) return;
      commit(applied.state);
      if (applied.cards.length > 0) {
        triggerPopup(applied.cards, applied.rejecting);
        setRulePause(isRulePlay(applied.cards));
      }
    },
    [isGuest, commit, triggerPopup],
  );

  useEffect(() => {
    if (!net) return;
    return net.subscribe(handleFrame);
  }, [net, handleFrame]);

  // Initialize the game only after mount (client-side) so Math.random()
  // doesn't cause a hydration mismatch.
  useEffect(() => {
    // A guest is dealt to. It waits for the host's first frame rather than
    // shuffling a table of its own, which would be a different table.
    if (isGuest) return;
    const id = requestAnimationFrame(() => {
      commit(initGame(numPlayers, mode, seats));
      playSound("start");
    });
    return () => cancelAnimationFrame(id);
    // seats is fixed for the life of a board — the key changes with the setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPlayers, mode, isGuest, commit]);

  // AI turn handling
  useEffect(() => {
    if (!game) return;
    // The host plays the bots for the whole table. If a guest ran them too,
    // both phones would decide the same bot's move separately.
    if (isGuest) return;
    // Not until everyone has their cards.
    const seated = game.players.filter((player) => player.active).length;
    if (landed < seated * HAND_SIZE) return;
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
          commit(next);
          triggerPopup([five], true);
          return;
        }
        const next = drawCard(game, game.currentPlayerIndex);
        commit(next);
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
          commit(next);
          triggerPopup([card]);
        } else {
          const next = playCard(game, game.currentPlayerIndex, card);
          commit(next);
          triggerPopup([card]);
        }
      } else {
        const next = drawCard(game, game.currentPlayerIndex);
        commit(next);
        playSound("drawCard");
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [
    game,
    pendingShape,
    rulePause,
    isPaused,
    isGuest,
    landed,
    commit,
    triggerPopup,
  ]);

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
      const youWon = game.players[seat].active && game.winnerIndex === seat;
      playSound(youWon ? "win" : "lose");
    }
    prevOverRef.current = game.gameOver;
  }, [game, seat]);

  // All hooks above. Now guard for null game before rendering handlers.
  if (!game) {
    return (
      <div className="flex h-full items-center justify-center bg-linear-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white">
        <div className="animate-pulse text-xl font-semibold">
          {isGuest ? "Waiting for the host to deal…" : "Shuffling the deck…"}
        </div>
      </div>
    );
  }

  const g = game; // non-null local alias for the handler closures
  const currentPlayer = g.players[g.currentPlayerIndex];

  // The seats a round is dealt to, in the order dealRound hands cards out:
  // one each, five times round, skipping anyone already eliminated.
  const dealOrder = g.players
    .map((player, index) => ({ player, index }))
    .filter((entry) => entry.player.active)
    .map((entry) => entry.index);
  const dealTotal = dealOrder.length * HAND_SIZE;
  const dealing = landed < dealTotal;
  // Whose card is in the air, for the caption under the pile.
  const dealingTo = dealing
    ? g.players[dealOrder[landed % dealOrder.length]]
    : null;

  /** How many of a seat's cards have reached them so far. */
  function dealtTo(index: number): number {
    const held = g.players[index].hand.length;
    if (!dealing) return held;
    const place = dealOrder.indexOf(index);
    if (place < 0) return 0;
    const round = Math.floor(
      (landed + dealOrder.length - 1 - place) / dealOrder.length,
    );
    return Math.min(held, Math.max(0, round));
  }

  // My turn, rather than any human's turn: in a game across phones the other
  // people are humans too, and their turn is not mine to play. And nobody's
  // turn until the cards are all out.
  const isHumanTurn =
    g.currentPlayerIndex === seat &&
    !dealing &&
    !g.gameOver &&
    !g.roundOver &&
    !isPaused;

  const effectiveShape: Shape = g.topCard.shape;

  // Compute playable cards for the human player
  const humanPlayable = new Set<string>();
  if (isHumanTurn && !pendingShape) {
    if (g.fiveResponse) {
      // Responding to a 5: the only way to escape is to play another 5.
      g.players[seat].hand.forEach((c) => {
        if (c.value === 5) humanPlayable.add(c.id);
      });
    } else if (g.holdAll) {
      g.players[seat].hand.forEach((c) => humanPlayable.add(c.id));
    } else {
      g.players[seat].hand.forEach((c) => {
        if (canPlay(c, g.topCard)) humanPlayable.add(c.id);
      });
    }
  }

  // Rebuilds the selected cards in the order the player clicked them. A Set
  // preserves insertion order, so the last card selected stays last in the
  // array — and playCard/playCards make that one the new top card.
  function selectedCardsInOrder(ids: Set<string>): Card[] {
    const byId = new Map(g.players[seat].hand.map((c) => [c.id, c]));
    return [...ids]
      .map((id) => byId.get(id))
      .filter((c): c is Card => c !== undefined);
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
    setSelectedIds(new Set());
    setSelectedValue(null);
    selectedIdsRef.current = new Set();
    selectedValueRef.current = null;
    triggerPopup(cards, rejecting);
    setRulePause(isRulePlay(cards));

    // A guest names the cards and lets the host work out what they do. The
    // popup and cleared selection above happen straight away so the tap feels
    // answered; the table itself updates when the host's frame lands.
    if (isGuest) {
      net?.send({ type: "play", cardIds: cards.map((c) => c.id) });
      return;
    }
    commit(
      cards.length === 1
        ? playCard(g, seat, cards[0])
        : playCards(g, seat, cards),
    );
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
    if (isGuest) {
      net?.send({ type: "draw" });
      return;
    }
    commit(drawCard(g, seat));
  }

  function handleEndHoldAll() {
    if (!isHumanTurn || pendingShape) return;
    if (submitTimer.current) clearTimeout(submitTimer.current);
    setSelectedIds(new Set());
    if (isGuest) {
      net?.send({ type: "endTurn" });
      return;
    }
    commit(endTurn(g, seat));
  }

  function handleShapePick(shape: Shape) {
    if (selectedIds.size === 0) return;
    const cards = selectedCardsInOrder(selectedIds);
    if (cards.length === 0) return;
    setSelectedIds(new Set());
    setPendingShape(false);
    triggerPopup(cards);
    setRulePause(isRulePlay(cards));
    if (isGuest) {
      net?.send({ type: "play", cardIds: cards.map((c) => c.id), shape });
      return;
    }
    commit(playCards(g, seat, cards, shape));
  }

  function handleNextRound() {
    setSelectedIds(new Set());
    setPendingShape(false);
    if (isGuest) {
      net?.send({ type: "nextRound" });
      return;
    }
    commit(nextRound(g));
  }

  function restart() {
    if (submitTimer.current) clearTimeout(submitTimer.current);
    setSelectedIds(new Set());
    setPendingShape(false);
    // Only the host reshuffles, because it deals for the whole table. A
    // guest's Restart button is hidden rather than left to do nothing.
    if (isGuest) return;
    commit(initGame(numPlayers, mode, seats));
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
  // The other players still in, walked round the table in turn order from the
  // seat after mine — so whoever plays next sits on my right, the one after
  // them opposite me, and the last on my left. Each gets a distinct position,
  // so a single remaining opponent is only ever drawn once. Every phone draws
  // this from its own seat outwards, which is what puts each player at the
  // bottom of their own screen holding their own cards.
  const others: { player: Player; index: number }[] = [];
  for (let step = 1; step < g.players.length; step++) {
    const index = (seat + step) % g.players.length;
    if (g.players[index].active) {
      others.push({ player: g.players[index], index });
    }
  }
  const isElim = g.mode === "elimination";
  const topBot = isElim ? (others[1] ?? null) : (others[0] ?? null);
  const rightBot = isElim ? (others[0] ?? null) : null;
  const leftBot = others[2] ?? null;
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
    const totalOfValue = g.players[seat].hand.filter(
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
          {!g.gameOver && !g.roundOver && !net && (
            <button
              type="button"
              onClick={handlePause}
              className="rounded-lg border border-white/20 px-3 py-1 text-sm font-semibold transition hover:bg-white/10"
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
          {!isGuest && (
            <button
              type="button"
              onClick={restart}
              className="rounded-lg border border-white/20 px-3 py-1 text-sm font-semibold transition hover:bg-white/10"
            >
              Restart
            </button>
          )}
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
              name={topBot.player.name}
              count={dealtTo(topBot.index)}
              dealing={dealing}
              isTurn={
                g.currentPlayerIndex === topBot.index &&
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
                name={leftBot.player.name}
                count={dealtTo(leftBot.index)}
                dealing={dealing}
                side="left"
                isTurn={
                  g.currentPlayerIndex === leftBot.index &&
                  !g.gameOver &&
                  !g.roundOver
                }
              />
            )}
          </div>

          {/* Center: discard pile + deck + status */}
          <div className="flex shrink-0 flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-4">
              {/* The starting card is turned up only once everyone has been
              dealt to, so the placeholder keeps the table from shifting under
              the cards while they are still going out. */}
              {dealing ? (
                <div className="h-40 w-28 rounded-xl border-2 border-dashed border-white/20" />
              ) : (
                g.topCard && <ClassDiscardPile topCard={g.topCard} />
              )}
              <button
                type="button"
                onClick={handleDraw}
                disabled={!isHumanTurn || pendingShape}
                title={isHumanTurn ? "Click to draw a card" : ""}
                className="relative h-40 w-28 rounded-xl transition hover:scale-105 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/* Cards left to come: the deck proper, plus the ones still to
                be dealt and the starting card yet to be turned up. */}
                <DeckCard
                  count={
                    dealing
                      ? g.deck.length + 1 + (dealTotal - landed)
                      : g.deck.length
                  }
                />
              </button>
            </div>

            {/* Status text */}
            <div className="flex flex-col items-center gap-1 text-sm text-emerald-200">
              {dealing ? (
                <div className="text-sm font-semibold text-amber-300">
                  Dealing to{" "}
                  <span className="font-bold text-white">
                    {dealingTo?.name}
                  </span>
                  …
                </div>
              ) : (
                <div>
                  Current shape:{" "}
                  <span className="font-bold text-white">
                    {describeShape(effectiveShape)}
                  </span>
                </div>
              )}
              {!dealing && !isHumanTurn && !g.gameOver && !g.roundOver && (
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
                name={rightBot.player.name}
                count={dealtTo(rightBot.index)}
                dealing={dealing}
                side="right"
                isTurn={
                  g.currentPlayerIndex === rightBot.index &&
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
          cards={g.players[seat].hand.slice(0, dealtTo(seat))}
          dealing={dealing}
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
              {g.roundWinnerIndex === seat
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
        g.winnerIndex !== seat &&
        !g.players[seat].active && (
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
                      i === seat
                        ? "border-red-300 bg-red-50"
                        : i === g.winnerIndex
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-zinc-200 bg-zinc-50 opacity-70"
                    }`}
                  >
                    <span className="font-bold">
                      {p.name}
                      {i === seat && !p.active && " (eliminated) ❌"}
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
        !(g.mode === "elimination" && !g.players[seat].active) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
              <div className="text-6xl mb-2">🏆</div>
              <h2 className="text-3xl font-black">
                {g.winnerIndex === seat
                  ? g.mode === "1v1"
                    ? "You win the 1v1 match!"
                    : "You are the Champion!"
                  : g.mode === "1v1"
                    ? `${winner.name} wins the 1v1 match!`
                    : `${winner.name} is the Champion!`}
              </h2>
              <p className="mt-2 text-zinc-600">
                {g.mode === "1v1"
                  ? g.winnerIndex === seat
                    ? "You emptied your hand first. Well played!"
                    : "Your opponent emptied their hand first. Better luck next time!"
                  : g.winnerIndex === seat
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
