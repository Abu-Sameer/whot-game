import { createDeck, shuffle } from "./deck";
import type { Card, Player, Shape } from "./types";

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  topCard: Card;
  // Direction 1 = clockwise, -1 = counter-clockwise (optional, kept simple)
  direction: 1 | -1;
  deck: Card[];
  log: string[];
  gameOver: boolean;
  winnerIndex: number | null;
  // When a whot is played, the human must pick the next shape.
  pendingShapeSelection: boolean;
  // Skip tracking: a star played means the next player is skipped.
  jumpCount: number;
}

export function canPlay(
  card: Card,
  topCard: Card,
  currentShape?: Shape,
): boolean {
  const shape = currentShape ?? topCard.shape;
  if (card.shape === "whot") return true;
  if (shape === "whot") return true; // shape was just chosen by whot
  if (card.shape === shape) return true;
  if (card.value !== null && card.value === topCard.value) return true;
  return false;
}

export function initGame(): GameState {
  const deck = shuffle(createDeck());

  // Deal 7 cards to each of 4 players
  const players: Player[] = [
    { name: "You", hand: [], isHuman: true },
    { name: "Bot A", hand: [], isHuman: false },
    { name: "Bot B", hand: [], isHuman: false },
    { name: "Bot C", hand: [], isHuman: false },
  ];

  for (let i = 0; i < 7; i++) {
    for (const p of players) {
      const c = deck.pop();
      if (c) p.hand.push(c);
    }
  }

  // Flip the first card of the remaining deck as the top card.
  const topCard = deck.pop();
  if (!topCard) throw new Error("Deck empty at init");

  const log = [`Game started. Top card is ${describeCard(topCard)}.`];

  return {
    players,
    currentPlayerIndex: 0,
    topCard,
    direction: 1,
    deck,
    log,
    gameOver: false,
    winnerIndex: null,
    pendingShapeSelection: false,
    jumpCount: 0,
  };
}

export function describeCard(card: Card): string {
  if (card.shape === "whot") return "Whot";
  return `${card.value} of ${card.shape}s`;
}

/** Returns whether the game is over after this play. */
export function playCard(
  state: GameState,
  playerIndex: number,
  card: Card,
  chosenShape?: Shape,
): GameState {
  const player = state.players[playerIndex];
  const hand = player.hand.filter((c) => c.id !== card.id);

  const next: GameState = {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, hand } : p,
    ),
  };

  // Add to log
  const newTop = { ...card };
  next.topCard = newTop;
  next.deck = [...state.deck];
  next.log = [...state.log];

  next.log.push(`${player.name} played ${describeCard(card)}.`);

  // Determine shape now in effect
  let effectiveShape: Shape = card.shape;
  if (card.shape === "whot") {
    effectiveShape = chosenShape ?? card.shape;
    next.log.push(`${player.name} changed the shape to ${effectiveShape}s.`);
  }

  // Whot cards: the current player picks the shape -> set pending shape selection
  if (card.shape === "whot") {
    next.pendingShapeSelection = true;
    return next;
  }

  // Handle star (Hold On): skip next player
  const skipNext = card.shape === "star";

  // Simple rule: 'Whot' card gives another turn is ignored here for simplicity.

  // Determine if the game is over
  if (hand.length === 0) {
    next.gameOver = true;
    next.winnerIndex = playerIndex;
    next.currentPlayerIndex = playerIndex;
    return next;
  }

  // Advance to next player (star skips an extra player)
  const nextIndex = skipNext
    ? (playerIndex + 2 * state.direction + 4) % 4
    : (playerIndex + state.direction + 4) % 4;

  next.currentPlayerIndex = nextIndex;
  next.jumpCount = 0;

  return next;
}

/** Draw a card for a player. Returns updated state. */
export function drawCard(state: GameState, playerIndex: number): GameState {
  const deck = [...state.deck];
  const player = state.players[playerIndex];

  // If deck is empty, reshuffle the discard pile? For simplicity, just skip draw.
  if (deck.length === 0) {
    const next = {
      ...state,
      log: [
        ...state.log,
        `${player.name} couldn't draw (deck empty) and passed.`,
      ],
    };
    return advanceTurn(next, playerIndex);
  }

  const drawn = deck.pop()!;
  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, hand: [...p.hand, drawn] } : p,
  );

  const next: GameState = {
    ...state,
    players,
    deck,
    log: [...state.log, `${player.name} drew a card.`],
  };

  // Could immediately play the drawn card if it matches; we keep it simple:
  // player keeps the drawn card, turn passes.
  return advanceTurn(next, playerIndex);
}

function advanceTurn(state: GameState, playerIndex: number): GameState {
  if (state.gameOver) return state;
  const nextIndex = (playerIndex + state.direction + 4) % 4;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    jumpCount: 0,
  };
}

/** AI chooses a card to play. Returns null if none can be played. */
export function chooseAiCard(
  hand: Card[],
  topCard: Card,
  currentShape?: Shape,
): Card | null {
  const shape = currentShape ?? topCard.shape;

  // Prefer playing a Whot if no other option, else play star/hold on, then matching.
  const playable = hand.filter((c) => canPlay(c, topCard, shape));

  if (playable.length === 0) return null;

  // Favor playing Whot only if it's the only option, otherwise keep it.
  const nonWhot = playable.filter((c) => c.shape !== "whot");
  if (nonWhot.length > 0) {
    // Prefer star cards to skip opponents
    const stars = nonWhot.filter((c) => c.shape === "star");
    if (stars.length > 0) return stars[0];
    return nonWhot[0];
  }

  return playable[0];
}
