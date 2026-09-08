import { createDeck, shuffle } from "./deck";
import type { Card, Difficulty, GameMode, Player, Rules, Shape } from "./types";

export interface GameState {
  // Which rules this game is being played by, fixed when the cards are dealt.
  rules: Rules;
  // Changes every time cards are dealt. See lib/types.ts.
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
  // Whether the current player is playing on from a card of their own rather
  // than starting a fresh turn — a 1 keeps the turn through Hold All, and a 14
  // hands it straight back. What follows is a continuation, and gets called as
  // one.
  continuedTurn: boolean;
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

export interface RoundElimination {
  // Name of the player eliminated at the end of the round.
  name: string;
  // The hand total that got them eliminated.
  total: number;
}

/**
 * The shape that has to be followed: whatever a Whot asked for, or failing
 * that the top card's own shape.
 */
export function activeShape(state: GameState): Shape {
  return state.requestedShape ?? state.topCard.shape;
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

/**
 * The next player still in the game, walking in `direction` from `from`.
 *
 * Eliminated players keep their place at the table rather than being taken out
 * of the list, so every step round it has to walk past them — a penalty or a
 * skip aimed at an empty chair would otherwise land on nobody.
 */
function nextActive(
  players: Player[],
  from: number,
  direction: 1 | -1,
): number {
  const n = players.length;
  let index = (from + direction + n) % n;
  for (let guard = 0; guard < n && !players[index].active; guard++) {
    index = (index + direction + n) % n;
  }
  return index;
}

/** Cards each player is dealt at the start of a round. */
export const HAND_SIZE = 5;

/**
 * Settles a play that left its player holding nothing.
 *
 * If the card can be won on, that is the round. If it cannot, the play still
 * stands — the card is on the pile and its rule applies as normal — but the
 * player goes to market for one card rather than winning, and the game carries
 * on from there.
 *
 * Returns true when the round has been won and the caller should stop.
 */
function settleEmptyHand(
  next: GameState,
  playerIndex: number,
  lastCard: Card,
  rules: Rules,
): boolean {
  const win = () => {
    next.roundOver = true;
    next.roundWinnerIndex = playerIndex;
    next.currentPlayerIndex = playerIndex;
    // A won round has no turn left to be in the middle of: a pick 3 nobody
    // has to answer, or a Hold All run nobody is on.
    next.fiveResponse = false;
    next.holdAll = false;
    next.continuedTurn = false;
    next.jumpCount = 0;
    return true;
  };

  if (canFinishOn(lastCard, rules)) return win();

  // Turn the discard pile over if the deck has run dry, so there is something
  // to hand them.
  let deck = next.deck;
  if (deck.length === 0 && next.discardPile.length > 0) {
    deck = shuffle(next.discardPile);
    next.discardPile = [];
  }
  // Nothing left anywhere to draw from: let the round end rather than leave
  // somebody holding no cards and unable to finish.
  if (deck.length === 0) return win();

  const name = next.players[playerIndex].name;
  const drawn = drawCardsForPlayer(
    deck,
    next.players,
    playerIndex,
    1,
    next.log,
  );
  next.deck = drawn.deck;
  next.players = drawn.players;
  next.log = [
    ...drawn.log,
    `${name} could not win on ${describeCard(lastCard)} and went to market.`,
  ];
  return false;
}

/**
 * Creates a fresh round for the given table.
 *
 * Everyone keeps the place they had, eliminated players included — they simply
 * are not dealt to. Taking them out of the list instead would shuffle everyone
 * after them up a seat, and a player who spent the last round on your left
 * would suddenly be sitting opposite you.
 */
function dealRound(
  seats: { name: string; isHuman: boolean; active?: boolean }[],
  roundNumber: number,
  mode: GameMode,
  rules: Rules,
): GameState {
  const deck = shuffle(createDeck());

  const players: Player[] = seats.map((p) => ({
    name: p.name,
    hand: [],
    isHuman: p.isHuman,
    active: p.active ?? true,
  }));

  const dealtTo = players.filter((p) => p.active);
  for (let i = 0; i < HAND_SIZE; i++) {
    for (const p of dealtTo) {
      const c = deck.pop();
      if (c) p.hand.push(c);
    }
  }

  // Flip the first card of the remaining deck as the top card.
  const topCard = deck.pop();
  if (!topCard) throw new Error("Deck empty at init");

  const log = [
    `Round ${roundNumber} started. Top card is ${describeCard(topCard)}.`,
  ];

  return {
    dealId: `${roundNumber}-${Math.random().toString(36).slice(2, 10)}`,
    mode,
    players,
    currentPlayerIndex: Math.max(
      0,
      players.findIndex((p) => p.active),
    ),
    topCard,
    direction: 1,
    deck,
    log,
    gameOver: false,
    winnerIndex: null,
    roundOver: false,
    roundWinnerIndex: null,
    roundNumber,
    lastElimination: null,
    requestedShape: null,
    continuedTurn: false,
    jumpCount: 0,
    holdAll: false,
    fiveResponse: false,
    discardPile: [],
    rules,
  };
}

/** How the game plays unless somebody changes it in Settings. */
export const DEFAULT_RULES: Rules = {
  pick2: true,
  pick3: true,
  suspension: true,
  holdAll: true,
  endOnSpecial: false,
  doubles: true,
};

/** Whether the rule a card carries is switched on in this game. */
function ruleActive(value: number | null, rules: Rules): boolean {
  switch (value) {
    case 1:
      return rules.holdAll;
    case 2:
      return rules.pick2;
    case 5:
      return rules.pick3;
    case 8:
      return rules.suspension;
    default:
      // 14 and the plain numbers are not switchable.
      return true;
  }
}

// Numbers a round cannot be won on. Each of these needs the player who put it
// down to still be there afterwards: Hold All and general market both hand the
// turn straight back to them, a suspension is a skip they have to be around to
// give, and a Whot names a shape for a hand they no longer hold. Whot cards
// are the 20s.
//
// Pick 2 and pick 3 are not among them. Those land entirely on the next
// player, so there is nothing left for the one who played it to do — a 2 or a
// 5 wins the round outright, a 5 played to cancel a pick 3 included.
const CANNOT_FINISH = new Set([1, 8, 14, 20]);

/**
 * Whether a round may be won on this card.
 *
 * Playing one of these as your last card is perfectly legal — it just cannot
 * be the last thing you do, so instead of winning you go to market for a card
 * and play carries on. See settleEmptyHand.
 */
export function canFinishOn(card: Card, rules: Rules): boolean {
  if (rules.endOnSpecial) return true;
  if (card.shape === "whot") return false;
  if (card.value === null) return false;
  // A card whose rule is switched off is an ordinary number, and an ordinary
  // number can finish a round.
  if (!ruleActive(card.value, rules)) return true;
  return !CANNOT_FINISH.has(card.value);
}

/** What the bots are called unless somebody renames them. */
export const BOT_NAMES = ["Ola", "Ade", "Dele"];

/** One place at the table: who sits there, and whether a person plays it. */
export interface Seat {
  name: string;
  isHuman: boolean;
}

/**
 * Initializes a new game with `numPlayers` total players in the given `mode`
 * ("1v1" = single round, "elimination" = tournament).
 *
 * `seats` names the table and says which places people are playing: the setup
 * screen fills it in, and a game across several phones uses it to seat the
 * other players where bots would otherwise be. Left out, the table falls back
 * to one human with bots in every other place.
 */
export function initGame(
  numPlayers = 4,
  mode: GameMode = "elimination",
  seats?: Seat[],
  rules?: Rules,
): GameState {
  const count = Math.max(2, Math.min(4, Math.floor(numPlayers)));
  const table: Seat[] = seats?.length
    ? seats.slice(0, count)
    : [
        { name: "You", isHuman: true },
        ...Array.from({ length: count - 1 }, (_, i) => ({
          name: BOT_NAMES[i] ?? `Player ${i + 1}`,
          isHuman: false,
        })),
      ];
  return dealRound(table, 1, mode, rules ?? DEFAULT_RULES);
}

export function describeCard(card: Card): string {
  if (card.shape === "whot") return "Whot";
  return `${card.value} of ${card.shape}s`;
}

/**
 * Plays multiple cards of the same number at once (e.g. two 7s together).
 * All cards must be playable and share the same value. Returns updated state.
 */
export function playCards(
  state: GameState,
  playerIndex: number,
  cards: Card[],
  chosenShape?: Shape,
): GameState {
  const player = state.players[playerIndex];
  const ids = new Set(cards.map((c) => c.id));
  const hand = player.hand.filter((c) => !ids.has(c.id));

  const next: GameState = {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, hand } : p,
    ),
  };

  // The card the player selected LAST goes face-up on the pile; the rest of
  // the group slides underneath it into the discard pile.
  const newTop = { ...cards[cards.length - 1] };
  next.topCard = newTop;
  next.deck = [...state.deck];
  next.log = [...state.log];
  // Previous top card, plus every played card except the new top.
  next.discardPile = [
    ...state.discardPile,
    state.topCard,
    ...cards.slice(0, -1),
  ];

  next.log.push(
    `${player.name} played ${cards.length} cards together: ${cards
      .map(describeCard)
      .join(", ")}.`,
  );

  // Only the last card's shape and value govern the effect.
  const lastCard = cards[cards.length - 1];

  // Hand-built states (the dev scripts) may not carry rules; fall back rather
  // than crash on them.
  const rules = state.rules ?? DEFAULT_RULES;

  // A Whot names the shape everyone has to follow from here. Remembering it
  // is the whole of the card's effect — there is no rule beyond that, so the
  // turn passes on at the end like any plain card's would.
  next.requestedShape =
    lastCard.shape === "whot" ? (chosenShape ?? null) : null;
  if (lastCard.shape === "whot" && chosenShape) {
    next.log.push(`${player.name} changed the shape to ${chosenShape}s.`);
  }

  // A play that emptied the hand either wins the round, or sends its player to
  // market because the card cannot be won on.
  let wentToMarket = false;
  if (hand.length === 0) {
    if (settleEmptyHand(next, playerIndex, lastCard, rules)) return next;
    wentToMarket = true;
  }
  // A card whose rule is switched off keeps its number but loses its effect,
  // so every branch below misses it and the turn simply passes on.
  const cardValue = ruleActive(lastCard.value, rules) ? lastCard.value : null;
  // The immediate next player in the current direction.
  const nextIndex = nextActive(state.players, playerIndex, state.direction);
  // The player who plays after the penalty row (skipping the drawn player).
  const afterIndex = nextActive(state.players, nextIndex, state.direction);
  // For skip cards (star / 8), the turn jumps to the player after the next one.
  // The seat after the skipped one is the same seat as after a penalty.
  const skipIndex = afterIndex;

  let deck = next.deck;
  let players = next.players;
  let log = [...next.log];

  if (cardValue === 2) {
    // Next player draws 2 cards and does NOT play; the player after them plays.
    ({ deck, players, log } = drawCardsForPlayer(
      deck,
      players,
      nextIndex,
      2,
      log,
    ));
    log.push(
      `${player.name} played a 2 — ${players[nextIndex].name} draws 2 cards and is skipped.`,
    );
  } else if (cardValue === 5) {
    if (state.fiveResponse) {
      // These 5s were played to answer a pick 3, and answering it cancels it
      // outright: the challenge ends here rather than being handed along, and
      // the next player takes an ordinary turn with no penalty to serve.
      next.fiveResponse = false;
      next.currentPlayerIndex = nextIndex;
      next.holdAll = false;
      log.push(
        `${player.name} cancelled the pick 3 with ${cards.length > 1 ? `${cards.length} 5s` : "a 5"} — ${players[nextIndex].name} plays on.`,
      );
      next.log = log;
      next.jumpCount = 0;
      return next;
    }
    // A fresh 5 challenges the next player: they may answer with their own 5
    // to cancel it, or draw 3 cards. We set up that response state here and
    // let playCard/playCards/drawCard resolve it.
    next.fiveResponse = true;
    next.currentPlayerIndex = nextIndex;
    next.holdAll = false;
    log.push(
      `${player.name} played a 5 — ${players[nextIndex].name} must draw 3 cards or play a 5 to cancel it!`,
    );
    next.log = log;
    next.jumpCount = 0;
    return next;
  } else if (cardValue === 14) {
    // All players except the current player draw 1 card; current player plays again.
    for (let i = 0; i < players.length; i++) {
      if (i !== playerIndex && players[i].active) {
        ({ deck, players, log } = drawCardsForPlayer(deck, players, i, 1, log));
      }
    }
    log.push(
      `${player.name} played a 14 — everyone else draws 1 card, and ${player.name} plays again.`,
    );
  }

  next.deck = deck;
  next.players = players;
  next.log = log;

  if (cardValue === 1) {
    // "Hold All": the player keeps the turn and may play any card next.
    next.holdAll = true;
    next.continuedTurn = true;
    next.currentPlayerIndex = playerIndex;
    log.push(`${player.name} played a 1 — Hold All! They may play any card.`);
    next.log = log;
  } else if (cardValue === 14) {
    // Card 14: the current player plays again. They have to follow the pile
    // as normal, so no Hold All — but it is still the same turn carrying on.
    next.holdAll = false;
    next.continuedTurn = true;
    next.currentPlayerIndex = playerIndex;
    next.log = log;
  } else if (cardValue === 8) {
    // 8: skip (hold) the next player entirely. (Star has no special rule.)
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = skipIndex;
  } else if (cardValue === 2 || cardValue === 5) {
    // Cards 2 & 5: the player who drew the penalty is skipped; the player after them plays.
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = afterIndex;
  } else {
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = nextIndex;
  }

  // Having had to go to market on their last card, their turn is over whatever
  // the card would otherwise have granted them: no Hold All, no second go off
  // a 14, and no skip to hand out. Play moves on to the next player. Anything
  // the card did to the others — a general market, say — still stands; it is
  // only the extra turn that is taken back.
  if (wentToMarket) {
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = nextIndex;
  }

  next.jumpCount = 0;

  return next;
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
  // Previous top card joins the discard pile.
  next.discardPile = [...state.discardPile, state.topCard];

  next.log.push(`${player.name} played ${describeCard(card)}.`);

  // Hand-built states (the dev scripts) may not carry rules; fall back rather
  // than crash on them.
  const rules = state.rules ?? DEFAULT_RULES;

  // A Whot names the shape everyone has to follow from here. Remembering it
  // is the whole of the card's effect — there is no rule beyond that, so the
  // turn passes on at the end like any plain card's would.
  next.requestedShape = card.shape === "whot" ? (chosenShape ?? null) : null;
  if (card.shape === "whot" && chosenShape) {
    next.log.push(`${player.name} changed the shape to ${chosenShape}s.`);
  }

  // A play that emptied the hand either wins the round, or sends its player to
  // market because the card cannot be won on.
  let wentToMarket = false;
  if (hand.length === 0) {
    if (settleEmptyHand(next, playerIndex, card, rules)) return next;
    wentToMarket = true;
  }
  // A card whose rule is switched off keeps its number but loses its effect,
  // so every branch below misses it and the turn simply passes on.
  const cardValue = ruleActive(card.value, rules) ? card.value : null;
  // The immediate next player in the current direction.
  const nextIndex = nextActive(state.players, playerIndex, state.direction);
  // The player who plays after the penalty row (skipping the drawn player).
  const afterIndex = nextActive(state.players, nextIndex, state.direction);
  // For skip cards (star / 8), the turn jumps to the player after the next one.
  // The seat after the skipped one is the same seat as after a penalty.
  const skipIndex = afterIndex;

  let deck = next.deck;
  let players = next.players;
  let log = [...next.log];

  if (cardValue === 2) {
    // Next player draws 2 cards and does NOT play; the player after them plays.
    ({ deck, players, log } = drawCardsForPlayer(
      deck,
      players,
      nextIndex,
      2,
      log,
    ));
    log.push(
      `${player.name} played a 2 — ${players[nextIndex].name} draws 2 cards and is skipped.`,
    );
  } else if (cardValue === 5) {
    if (state.fiveResponse) {
      // This 5 was played to answer a pick 3, and answering it cancels it
      // outright: the challenge ends here rather than being handed along, and
      // the next player takes an ordinary turn with no penalty to serve.
      next.fiveResponse = false;
      next.currentPlayerIndex = nextIndex;
      next.holdAll = false;
      log.push(
        `${player.name} cancelled the pick 3 with a 5 — ${players[nextIndex].name} plays on.`,
      );
      next.log = log;
      next.jumpCount = 0;
      return next;
    }
    // A fresh 5 challenges the next player: they may answer with their own 5
    // to cancel it, or draw 3 cards.
    next.fiveResponse = true;
    next.currentPlayerIndex = nextIndex;
    next.holdAll = false;
    log.push(
      `${player.name} played a 5 — ${players[nextIndex].name} must draw 3 cards or play a 5 to cancel it!`,
    );
    next.log = log;
    next.jumpCount = 0;
    return next;
  } else if (cardValue === 14) {
    // All players except the current player draw 1 card; current player plays again.
    for (let i = 0; i < players.length; i++) {
      if (i !== playerIndex && players[i].active) {
        ({ deck, players, log } = drawCardsForPlayer(deck, players, i, 1, log));
      }
    }
    log.push(
      `${player.name} played a 14 — everyone else draws 1 card, and ${player.name} plays again.`,
    );
  }

  next.deck = deck;
  next.players = players;
  next.log = log;

  if (cardValue === 1) {
    // "Hold All": the player keeps the turn and may play any card next.
    next.holdAll = true;
    next.continuedTurn = true;
    next.currentPlayerIndex = playerIndex;
    log.push(`${player.name} played a 1 — Hold All! They may play any card.`);
    next.log = log;
  } else if (cardValue === 14) {
    // Card 14: the current player plays again. They have to follow the pile
    // as normal, so no Hold All — but it is still the same turn carrying on.
    next.holdAll = false;
    next.continuedTurn = true;
    next.currentPlayerIndex = playerIndex;
    next.log = log;
  } else if (cardValue === 8) {
    // 8: skip (hold) the next player entirely. (Star has no special rule.)
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = skipIndex;
  } else if (cardValue === 2 || cardValue === 5) {
    // Cards 2 & 5: the player who drew the penalty is skipped; the player after them plays.
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = afterIndex;
  } else {
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = nextIndex;
  }

  // Having had to go to market on their last card, their turn is over whatever
  // the card would otherwise have granted them: no Hold All, no second go off
  // a 14, and no skip to hand out. Play moves on to the next player. Anything
  // the card did to the others — a general market, say — still stands; it is
  // only the extra turn that is taken back.
  if (wentToMarket) {
    next.holdAll = false;
    next.continuedTurn = false;
    next.currentPlayerIndex = nextIndex;
  }

  next.jumpCount = 0;

  return next;
}

/**
 * Draws `count` cards from the deck, adding them to the given player's hand.
 * Returns new deck, players, and log arrays (immutably).
 */
function drawCardsForPlayer(
  deck: Card[],
  players: Player[],
  playerIndex: number,
  count: number,
  log: string[],
): { deck: Card[]; players: Player[]; log: string[] } {
  const newDeck = [...deck];
  let newPlayers = [...players];
  let newLog = [...log];
  const playerName = players[playerIndex].name;

  for (let n = 0; n < count; n++) {
    if (newDeck.length === 0) {
      newLog = [...newLog, `${playerName} couldn't draw (deck empty).`];
      break;
    }
    const drawn = newDeck.pop()!;
    newPlayers = newPlayers.map((p, i) =>
      i === playerIndex ? { ...p, hand: [...p.hand, drawn] } : p,
    );
  }

  return { deck: newDeck, players: newPlayers, log: newLog };
}

/** Draw a card for a player. Returns updated state. */
export function drawCard(state: GameState, playerIndex: number): GameState {
  // If the current player is responding to a played 5 and chooses to draw
  // instead of playing their own 5, they must draw the 3-card penalty and the
  // turn passes to the player after them.
  if (state.fiveResponse) {
    const afterIndex = nextActive(state.players, playerIndex, state.direction);
    let deck = [...state.deck];
    const discardPile = [...state.discardPile];
    let players = state.players;
    let log = [...state.log];

    ({ deck, players, log } = drawCardsForPlayer(
      deck,
      players,
      playerIndex,
      3,
      log,
    ));
    log.push(
      `${players[playerIndex].name} drew 3 cards (couldn't/wouldn't play a 5).`,
    );

    return {
      ...state,
      players,
      deck,
      discardPile,
      log,
      fiveResponse: false,
      currentPlayerIndex: afterIndex,
      jumpCount: 0,
      holdAll: false,
    };
  }

  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  const player = state.players[playerIndex];

  // If deck is empty, reshuffle the discard pile back into the deck.
  if (deck.length === 0) {
    if (discardPile.length > 0) {
      deck = shuffle(discardPile);
      discardPile = [];
      const log = [
        ...state.log,
        `Deck empty — reshuffled the discard pile into the deck.`,
      ];
      const reshuffled: GameState = { ...state, deck, discardPile, log };
      return drawCard(reshuffled, playerIndex);
    }
    // Nothing left to draw from.
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
  if (state.gameOver || state.roundOver) return state;
  return {
    ...state,
    currentPlayerIndex: nextActive(state.players, playerIndex, state.direction),
    jumpCount: 0,
    holdAll: false,
    continuedTurn: false,
  };
}

/** Ends the current player's turn (used to stop a "Hold All" run). */
export function endTurn(state: GameState, playerIndex: number): GameState {
  return advanceTurn(state, playerIndex);
}

/** Computes the total face value of a player's hand (Whot = 20). */
export function handValue(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + (c.value ?? 20), 0);
}

/**
 * Called after a round ends. In "1v1" mode, the round winner is immediately
 * crowned the overall champion. In "elimination" mode, the active (non-winner)
 * player with the highest hand total is eliminated, then either the next round
 * starts or the overall winner is crowned if only one player remains.
 */
export function nextRound(state: GameState): GameState {
  if (!state.roundOver) return state;

  const roundWinnerIndex = state.roundWinnerIndex;
  const roundWinnerName =
    roundWinnerIndex !== null ? state.players[roundWinnerIndex].name : null;

  // 1v1: first to empty their hand wins the whole match.
  if (state.mode === "1v1") {
    return {
      ...state,
      gameOver: true,
      winnerIndex: roundWinnerIndex,
      log: [...state.log, `${roundWinnerName} wins the 1v1 match!`],
    };
  }

  // Candidates for elimination: active players who did NOT win this round.
  const candidates = state.players.filter(
    (p) => p.active && p.name !== roundWinnerName,
  );

  // Determine the highest hand total among candidates.
  let highest = -1;
  let eliminated: Player | null = null;
  for (const p of candidates) {
    const total = handValue(p.hand);
    if (total > highest) {
      highest = total;
      eliminated = p;
    }
  }

  let players = state.players.map((p) => ({ ...p, hand: [] }));
  let log = [...state.log];
  let lastElimination: RoundElimination | null = null;
  let remaining = players.filter((p) => p.active);

  if (eliminated) {
    const eliminatedName = eliminated.name;
    players = players.map((p) =>
      p.name === eliminatedName ? { ...p, active: false } : p,
    );
    lastElimination = { name: eliminatedName, total: highest };
    log = [
      ...log,
      `${eliminatedName} is eliminated with a hand value of ${highest}.`,
    ];
  }

  // If the human player was eliminated, the game is over immediately.
  // (We don't keep watching the bots play on without the player.)
  if (eliminated && eliminated.isHuman) {
    const winnerIndex = players.findIndex((p) => p.active);
    return {
      ...state,
      players,
      log,
      gameOver: true,
      roundOver: true,
      winnerIndex: winnerIndex >= 0 ? winnerIndex : null,
      lastElimination,
    };
  }

  remaining = players.filter((p) => p.active);

  if (remaining.length <= 1) {
    // Only one player remains — they are the overall winner.
    const winnerIndex = players.findIndex((p) => p.active);
    return {
      ...state,
      players,
      log,
      gameOver: true,
      roundOver: true,
      winnerIndex,
      lastElimination,
    };
  }

  // Start the next round with the remaining players.
  const roundNumber = state.roundNumber + 1;
  // The whole table, not just who is left: an eliminated player keeps their
  // chair so that nobody else has to move into it.
  const table = players.map((p) => ({
    name: p.name,
    isHuman: p.isHuman,
    active: p.active,
  }));

  const fresh = dealRound(table, roundNumber, state.mode, state.rules);
  return {
    ...fresh,
    log: [
      ...log,
      `Round ${roundNumber} begins with ${remaining.length} players.`,
    ],
    lastElimination,
  };
}

/**
 * Human-readable label for how many same-numbered cards went down together.
 * "Double" for 2, "Triple" for 3, and so on.
 */
export function multiPlayLabel(count: number): string {
  switch (count) {
    case 2:
      return "Double";
    case 3:
      return "Triple";
    case 4:
      return "Quadruple";
    default:
      return `${count}x`;
  }
}

/**
 * Returns a short, dramatic rule message for a played card, or null if the
 * card has no special rule. Used to show a pop-up notification in the UI.
 */
export function ruleMessage(
  card: Card,
  opts?: { rejecting?: boolean; count?: number; rules?: Rules },
): string | null {
  // Nothing to announce for a card whose rule is switched off — it played as
  // an ordinary number.
  const rules = opts?.rules ?? DEFAULT_RULES;
  if (!ruleActive(card.value, rules)) return null;
  // A 5 played while facing a 5 challenge cancels the pick-3 and hands it on.
  // Same when the cancellation is done with a double or triple of 5s.
  if (opts?.rejecting && card.value === 5) {
    const count = opts.count ?? 1;
    const label = count > 1 ? `${multiPlayLabel(count)} 5` : "A 5";
    return `${label} — pick 3 cancelled! 🚫`;
  }
  if (card.shape === "whot") return "WHOT! Pick a new shape 🔥";
  switch (card.value) {
    case 1:
      return "Hold All! You play again — any card 🃏";
    case 2:
      return "Next player draws 2 cards and is skipped 🛑";
    case 5:
      return "Next player draws 3 cards and is skipped 🛑";
    case 8:
      return "Hold the next player! They are skipped 🛑";
    case 14:
      return "Everyone else draws 1 card — you play again 🔄";
    default:
      return null;
  }
}

/**
 * The call for a play, the way it would be shouted across a table — or null
 * for a plain card, which is called by nothing but the sound of it landing.
 *
 * A 5 answering a pending 5 is a rejection rather than a fresh pick-three, and
 * that reading comes first: a pair of 5s played to escape one is still a
 * rejection, not a double. Otherwise a group of the same number is called as a
 * double, and a single card by whatever rule it carries. Whot cards are the
 * 20s, and asking for a shape is what "I need" is for.
 */
export function ruleCall(
  cards: Card[],
  opts?: { rejecting?: boolean; continuing?: boolean; rules?: Rules },
): string | null {
  const last = cards[cards.length - 1];
  const rules = opts?.rules ?? DEFAULT_RULES;
  if (opts?.rejecting && last.value === 5) return "reject";
  if (cards.length > 1) return "doubleNumber";
  if (last.shape === "whot") return "iNeed";
  // A card whose rule is switched off has no call of its own; it may still be
  // carrying a turn on from a 1, which is picked up at the end.
  switch (ruleActive(last.value, rules) ? last.value : null) {
    case 1:
      return "holdAll";
    case 2:
      return "pick2";
    case 5:
      return "pick3";
    case 8:
      return "suspension";
    case 14:
      return "generalMarket";
  }
  // Last, so that a card with a call of its own keeps it even when played off
  // a 1: another 1 is still "hold all", a 2 is still "pick 2", and a pair is
  // still a double. "Continue" is only for a plain card carrying the turn on,
  // which is the one case nothing else has anything to say about.
  if (opts?.continuing) return "continue";
  return null;
}

/** The most expensive card of a set to be caught holding at the end. */
function heaviest(cards: Card[]): Card {
  return cards.reduce((worst, card) =>
    (card.value ?? 0) > (worst.value ?? 0) ? card : worst,
  );
}

/**
 * Of the cards it can play, the ones in whichever shape it holds most of, so
 * playing one still leaves it something to follow with.
 */
function deepestShape(playable: Card[], hand: Card[]): Card[] {
  const held = new Map<Shape, number>();
  for (const card of hand)
    held.set(card.shape, (held.get(card.shape) ?? 0) + 1);

  let best = playable;
  let bestCount = -1;
  for (const shape of new Set(playable.map((c) => c.shape))) {
    const count = held.get(shape) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = playable.filter((c) => c.shape === shape);
    }
  }
  return best;
}

// One turn in five, an easy bot simply fails to spot the play it had.
const EASY_MISS_CHANCE = 0.2;

/**
 * AI chooses a card to play. Returns null if none can be played — or, on easy,
 * if it did not notice the one it had.
 *
 * The three levels are three different players rather than one player with a
 * dial on it:
 *
 * - easy plays whatever is legal, at random, and now and then misses its turn
 *   entirely and picks up instead.
 * - medium is the steady middle: it holds its Whot back and takes a free skip
 *   when one is going, but plans no further than that.
 * - hard plays the rules against you. It reaches first for the cards that cost
 *   whoever is next something or buy it another turn, and when there is
 *   nothing like that to play it sheds its heaviest card while staying in the
 *   shape it holds most of — which is what wins an elimination round, where
 *   the highest hand left goes out.
 */
export function chooseAiCard(
  hand: Card[],
  topCard: Card,
  opts: {
    currentShape?: Shape;
    holdAll?: boolean;
    difficulty?: Difficulty;
  } = {},
): Card | null {
  const { currentShape, holdAll, difficulty = "medium" } = opts;
  const shape = currentShape ?? topCard.shape;

  // During "Hold All", the AI may play any card.
  const playable = holdAll
    ? [...hand]
    : hand.filter((c) => canPlay(c, topCard, shape));

  if (playable.length === 0) return null;

  if (difficulty === "easy") {
    if (Math.random() < EASY_MISS_CHANCE) return null;
    return playable[Math.floor(Math.random() * playable.length)];
  }

  // A Whot is worth 20 against you at the end of a round and will go on
  // anything, so it is the last card either thinking level lets go of.
  const nonWhot = playable.filter((c) => c.shape !== "whot");
  if (nonWhot.length === 0) return playable[0];

  if (difficulty === "hard") {
    // 14 sends everyone else to the market and hands the turn straight back,
    // and 1 buys a free go at any card at all: the two best things to play.
    const tempo = nonWhot.filter((c) => c.value === 14 || c.value === 1);
    if (tempo.length > 0) return heaviest(tempo);
    // Then whatever makes the next player pick up and lose their turn.
    const attack = nonWhot.filter((c) => c.value === 2 || c.value === 5);
    if (attack.length > 0) return heaviest(attack);
    // Then a plain skip.
    const skip = nonWhot.filter((c) => c.value === 8);
    if (skip.length > 0) return skip[0];
    // Nothing special to play, so lose weight without losing the shape.
    return heaviest(deepestShape(nonWhot, hand));
  }

  // Prefer 8s to skip opponents
  const eights = nonWhot.filter((c) => c.value === 8);
  if (eights.length > 0) return eights[0];
  return nonWhot[0];
}
