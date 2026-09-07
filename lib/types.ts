export type Shape =
  | "circle"
  | "cross"
  | "square"
  | "star"
  | "triangle"
  | "whot";

export type GameMode = "1v1" | "elimination";

/**
 * Which of the game's rules are being played.
 *
 * Whot is played a little differently everywhere, so these are switches rather
 * than assumptions. Turning one off does not remove its card: the card stays
 * playable and still matches on its number, it just stops carrying the rule.
 */
export interface Rules {
  /** A 2 makes the next player draw 2 and miss their turn. */
  pick2: boolean;
  /** A 5 makes the next player draw 3, unless they answer with a 5. */
  pick3: boolean;
  /** An 8 skips the next player. */
  suspension: boolean;
  /** Any card may be played on a 1, and the player keeps the turn. */
  holdAll: boolean;
  /** A 1, 8, 14 or Whot may be the card a round is won on. */
  endOnSpecial: boolean;
  /** Cards of the same number may be played together in one turn. */
  doubles: boolean;
}

/** How hard the bots play. See chooseAiCard in lib/gameLogic.ts. */
export type Difficulty = "easy" | "medium" | "hard";

export interface Card {
  id: string;
  shape: Shape;
  // For whot cards, value is 20. For numbered cards, value is 1-14.
  value: number | null;
}

export interface Player {
  name: string;
  hand: Card[];
  isHuman: boolean;
  // Whether the player is still in the tournament (not yet eliminated).
  active: boolean;
}

export interface RoundElimination {
  // Name of the player eliminated at the end of the round.
  name: string;
  // The hand total that got them eliminated.
  total: number;
}

export interface GameState {
  // Which rules this game is being played by, fixed when the cards are dealt.
  rules: Rules;
  // Changes every time cards are dealt. That is what lets the board tell a
  // fresh hand from an ordinary move — a new round, or the same round number
  // dealt again after a restart — and because it travels with the state, a
  // guest's screen can tell them apart too.
  dealId: string;
  // Game mode: "1v1" = single round vs one bot, "elimination" = tournament.
  mode: GameMode;
  players: Player[];
  currentPlayerIndex: number;
  topCard: Card;
  // Direction 1 = clockwise, -1 = counter-clockwise (optional, kept simple)
  direction: 1 | -1;
  deck: Card[];
  log: string[];
  // The whole tournament is over (only one player remains).
  gameOver: boolean;
  winnerIndex: number | null;
  // The current round is over (a player emptied their hand).
  roundOver: boolean;
  // Index of the player who emptied their hand this round (safe from elimination).
  roundWinnerIndex: number | null;
  // Which round number we're on (1-based).
  roundNumber: number;
  // Elimination info for the just-finished round (null when no player eliminated yet).
  lastElimination: RoundElimination | null;
  // The shape a Whot asked everyone to follow, or null to follow the top
  // card's own shape. Without this the pile stays a Whot, which matches
  // anything — so the shape that was chosen has to be remembered here.
  requestedShape: Shape | null;
  // Skip tracking: a star played means the next player is skipped.
  jumpCount: number;
// "Hold All" active: after playing a 1, the current player may keep playing
  // any card (any number or shape) before the next player's turn.
  holdAll: boolean;
  // When a 5 is played, the next player may respond by playing their own 5 to
  // cancel the draw-3 penalty outright, or by drawing 3 cards. A cancelling 5
  // ends the challenge rather than handing it on.
  // True while the current player must make that choice.
  fiveResponse: boolean;
  // Played cards (excluding the current topCard). Used to reshuffle the deck
  // back when it runs out of cards.
  discardPile: Card[];
}
