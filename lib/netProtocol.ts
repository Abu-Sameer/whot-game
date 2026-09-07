/**
 * What the phones in a game say to each other.
 *
 * The host owns the game. It holds the only real GameState, deals the cards,
 * plays the bots and decides what every move does; a guest sends what it would
 * like to do and draws whatever comes back. That keeps the screens from ever
 * drifting apart, and means the rules only have to be enforced in one place.
 *
 * The shape is a star, not a mesh: every guest is connected to the host and to
 * nobody else. Guests never talk to each other, so adding a third or fourth
 * player costs one more handshake and nothing else.
 */
import type { Card, Shape } from "./types";
import type { GameState } from "./gameLogic";
import {
  canFinishOn,
  drawCard,
  endTurn,
  nextRound,
  playCard,
  playCards,
} from "./gameLogic";

export type NetRole = "host" | "guest";

/** The host always deals from the first seat; guests take the ones after it. */
export const HOST_SEAT = 0;

export type NetMessage =
  // Guest to host, first thing: who has joined.
  | { type: "hello"; name: string }
  // Host to one guest: the table as it stands, and which seat that guest
  // plays. The seat travels with every frame so a guest never has to remember
  // it or race to learn it.
  | { type: "state"; state: GameState; seat: number }
  // Guest to host: the moves a player can make.
  | { type: "play"; cardIds: string[]; shape?: Shape }
  | { type: "draw" }
  | { type: "endTurn" }
  | { type: "nextRound" };

/** The board's end of the link: what it can say, and how it hears back. */
export interface NetPlay {
  role: NetRole;
  /** Guest: ask the host for something. */
  send: (message: NetMessage) => void;
  /** Host: hand the table to every guest, each seeing only their own cards. */
  publish: (state: GameState) => void;
  /**
   * Host: `from` is the seat of the guest that asked. Guest: always the host.
   * Returns the unsubscribe function.
   */
  subscribe: (
    handler: (message: NetMessage, from: number) => void,
  ) => () => void;
}

/**
 * Reads a frame off the wire.
 *
 * Everything arriving here was written by another device, so nothing about it
 * is assumed until it has been checked. An unrecognised frame becomes null and
 * is dropped rather than trusted.
 */
export function parseMessage(value: unknown): NetMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const frame = value as Record<string, unknown>;

  switch (frame.type) {
    case "hello":
      return typeof frame.name === "string"
        ? { type: "hello", name: frame.name }
        : null;
    case "state":
      return isGameState(frame.state) && typeof frame.seat === "number"
        ? { type: "state", state: frame.state, seat: frame.seat }
        : null;
    case "play": {
      const { cardIds, shape } = frame;
      if (!Array.isArray(cardIds)) return null;
      if (!cardIds.every((id): id is string => typeof id === "string")) {
        return null;
      }
      return {
        type: "play",
        cardIds,
        shape: typeof shape === "string" ? (shape as Shape) : undefined,
      };
    }
    case "draw":
      return { type: "draw" };
    case "endTurn":
      return { type: "endTurn" };
    case "nextRound":
      return { type: "nextRound" };
    default:
      return null;
  }
}

/**
 * A shape check rather than a full validation. A guest only ever renders what
 * comes back, so a frame carrying the fields the board reads is safe to draw;
 * a malformed one would only break the sender's own screen.
 */
function isGameState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    Array.isArray(state.players) &&
    typeof state.currentPlayerIndex === "number" &&
    typeof state.topCard === "object" &&
    state.topCard !== null &&
    Array.isArray(state.deck)
  );
}

/** What a guest's request turned into, for the host to show and pass on. */
export interface GuestMove {
  state: GameState;
  /** The cards played, so the host's screen can announce the rule too. */
  cards: Card[];
  /** Whether the play was an answer to a pending 5. */
  rejecting: boolean;
  /** Whether the play carried on from a 1, rather than starting a turn. */
  continuing: boolean;
}

/**
 * Works out what a guest has asked for, or refuses it.
 *
 * This is where the host stops trusting the other phone. It checks that it is
 * really that seat's turn, that the round is still running, and that every
 * card named is one that seat actually holds — cards are named by id and
 * looked up in the hand the host has, so one the guest does not hold cannot be
 * played, whatever it sends. A refused request returns null and does nothing,
 * which is the right answer both for a cheat and for a frame that simply
 * crossed with the end of a round.
 */
export function applyGuestMove(
  state: GameState,
  message: NetMessage,
  seat: number,
): GuestMove | null {
  const unchanged = { cards: [], rejecting: false, continuing: false };

  if (message.type === "nextRound") {
    // Any player may ask to move on, so being asked twice has to be harmless.
    if (!state.roundOver || state.gameOver) return null;
    return { state: nextRound(state), ...unchanged };
  }

  if (state.gameOver || state.roundOver) return null;
  if (state.currentPlayerIndex !== seat) return null;

  switch (message.type) {
    case "draw":
      return { state: drawCard(state, seat), ...unchanged };
    case "endTurn":
      return { state: endTurn(state, seat), ...unchanged };
    case "play": {
      const hand = state.players[seat]?.hand ?? [];
      const cards = message.cardIds
        .map((id) => hand.find((card) => card.id === id))
        .filter((card): card is Card => card !== undefined);
      // Every id has to have matched, or the request named something that seat
      // is not holding and none of it is played.
      if (cards.length === 0 || cards.length !== message.cardIds.length) {
        return null;
      }
      // Playing several at once is a rule of its own, and it can be off.
      if (cards.length > 1 && !state.rules.doubles) return null;
      // A round cannot be finished on a card that carries a rule, so a play
      // that would empty the hand has to end on one that can. The card that
      // lands is the last of the group.
      if (
        cards.length === hand.length &&
        !canFinishOn(cards[cards.length - 1], state.rules)
      ) {
        return null;
      }
      const rejecting = state.fiveResponse;
      // Read before the play, because playing is what clears it.
      const continuing = state.holdAll;
      const next =
        cards.length === 1
          ? playCard(state, seat, cards[0], message.shape)
          : playCards(state, seat, cards, message.shape);
      return { state: next, cards, rejecting, continuing };
    }
    default:
      return null;
  }
}

// Stands in for a card the recipient is not entitled to see. Only the number
// of them ever reaches a screen — other players' cards are drawn face down,
// and the deck shows nothing but its size.
function hidden(index: number): Card {
  return { id: `hidden-${index}`, shape: "circle", value: null };
}

/**
 * Strips out everything one player should not be able to read, before the
 * state goes over the wire to them.
 *
 * Frames travel as plain JSON, so anything left in one is readable with the
 * browser's own tools — sending the whole table would hand over every other
 * player's hand. Once the round is over the hands go face up on the scoreboard
 * anyway, so from that point the real state goes out unchanged.
 */
export function redactFor(state: GameState, seat: number): GameState {
  if (state.roundOver || state.gameOver) return state;
  let counter = 0;
  const conceal = (cards: Card[]) => cards.map(() => hidden(counter++));
  return {
    ...state,
    players: state.players.map((player, index) =>
      index === seat ? player : { ...player, hand: conceal(player.hand) },
    ),
    // The deck's order is the next few draws, so only its size is public.
    deck: conceal(state.deck),
    discardPile: conceal(state.discardPile),
  };
}
