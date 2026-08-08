export type Shape =
  | "circle"
  | "cross"
  | "square"
  | "star"
  | "triangle"
  | "whot";

export type GameMode = "1v1" | "elimination";

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
  // When a whot is played, the human must pick the next shape.
  pendingShapeSelection: boolean;
  // Skip tracking: a star played means the next player is skipped.
  jumpCount: number;
// "Hold All" active: after playing a 1, the current player may keep playing
  // any card (any number or shape) before the next player's turn.
  holdAll: boolean;
  // When a 5 is played, the next player may respond by playing their own 5 to
  // escape the draw-3 penalty (passing it along), or by drawing 3 cards.
  // True while the current player must make that choice.
  fiveResponse: boolean;
  // Played cards (excluding the current topCard). Used to reshuffle the deck
  // back when it runs out of cards.
  discardPile: Card[];
}
