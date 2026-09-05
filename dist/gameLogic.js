"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canPlay = canPlay;
exports.initGame = initGame;
exports.describeCard = describeCard;
exports.playCards = playCards;
exports.playCard = playCard;
exports.drawCard = drawCard;
exports.endTurn = endTurn;
exports.handValue = handValue;
exports.nextRound = nextRound;
exports.ruleMessage = ruleMessage;
exports.chooseAiCard = chooseAiCard;
const deck_1 = require("./deck");
function canPlay(card, topCard, currentShape) {
    const shape = currentShape ?? topCard.shape;
    if (card.shape === "whot")
        return true;
    if (shape === "whot")
        return true; // shape was just chosen by whot
    if (card.shape === shape)
        return true;
    if (card.value !== null && card.value === topCard.value)
        return true;
    return false;
}
const HAND_SIZE = 5;
/**
 * Creates a fresh round for the given (active) players.
 * Each active player gets 5 cards; the next card is flipped as the top card.
 */
function dealRound(playerNames, roundNumber, mode) {
    const deck = (0, deck_1.shuffle)((0, deck_1.createDeck)());
    const players = playerNames.map((p) => ({
        name: p.name,
        hand: [],
        isHuman: p.isHuman,
        active: true,
    }));
    for (let i = 0; i < HAND_SIZE; i++) {
        for (const p of players) {
            const c = deck.pop();
            if (c)
                p.hand.push(c);
        }
    }
    // Flip the first card of the remaining deck as the top card.
    const topCard = deck.pop();
    if (!topCard)
        throw new Error("Deck empty at init");
    const log = [
        `Round ${roundNumber} started. Top card is ${describeCard(topCard)}.`,
    ];
    return {
        mode,
        players,
        currentPlayerIndex: 0,
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
        pendingShapeSelection: false,
        jumpCount: 0,
        holdAll: false,
        fiveResponse: false,
        discardPile: [],
    };
}
/**
 * Initializes a new game with `numPlayers` total players (1 human + bots)
 * in the given `mode` ("1v1" = single round, "elimination" = tournament).
 */
function initGame(numPlayers = 4, mode = "elimination") {
    const count = Math.max(2, Math.min(4, Math.floor(numPlayers)));
    const names = [
        { name: "You", isHuman: true },
    ];
    for (let i = 1; i < count; i++) {
        names.push({ name: `Player ${i}`, isHuman: false });
    }
    return dealRound(names, 1, mode);
}
function describeCard(card) {
    if (card.shape === "whot")
        return "Whot";
    return `${card.value} of ${card.shape}s`;
}
/**
 * Plays multiple cards of the same number at once (e.g. two 7s together).
 * All cards must be playable and share the same value. Returns updated state.
 */
function playCards(state, playerIndex, cards, chosenShape) {
    const player = state.players[playerIndex];
    const ids = new Set(cards.map((c) => c.id));
    const hand = player.hand.filter((c) => !ids.has(c.id));
    const next = {
        ...state,
        players: state.players.map((p, i) => i === playerIndex ? { ...p, hand } : p),
    };
    const newTop = { ...cards[cards.length - 1] };
    next.topCard = newTop;
    next.deck = [...state.deck];
    next.log = [...state.log];
    // Previous top card joins the discard pile.
    next.discardPile = [...state.discardPile, state.topCard];
    next.log.push(`${player.name} played ${cards.length} cards together: ${cards
        .map(describeCard)
        .join(", ")}.`);
    // Only the last card's shape and value govern the effect.
    const lastCard = cards[cards.length - 1];
    if (lastCard.shape === "whot") {
        const effectiveShape = chosenShape ?? lastCard.shape;
        next.log.push(`${player.name} changed the shape to ${effectiveShape}s.`);
        next.pendingShapeSelection = true;
        return next;
    }
    // If the player emptied their hand, the round is over (they win the round).
    if (hand.length === 0) {
        next.roundOver = true;
        next.roundWinnerIndex = playerIndex;
        next.currentPlayerIndex = playerIndex;
        next.log = [...next.log];
        return next;
    }
    const cardValue = lastCard.value;
    const n = state.players.length;
    // The immediate next player in the current direction.
    const nextIndex = (playerIndex + state.direction + n) % n;
    // The player who plays after the penalty row (skipping the drawn player).
    const afterIndex = (nextIndex + state.direction + n) % n;
    // For skip cards (star / 8), the turn jumps to the player after the next one.
    const skipIndex = (playerIndex + 2 * state.direction + n) % n;
    let deck = next.deck;
    let players = next.players;
    let log = [...next.log];
    if (cardValue === 2) {
        // Next player draws 2 cards and does NOT play; the player after them plays.
        ({ deck, players, log } = drawCardsForPlayer(deck, players, nextIndex, 2, log));
        log.push(`${player.name} played a 2 — ${players[nextIndex].name} draws 2 cards and is skipped.`);
    }
    else if (cardValue === 5) {
        // A 5 challenges the next player: they may respond with their own 5 to
        // escape the draw-3 penalty (passing it along), or draw 3 cards. We set up
        // that response state here and let playCard/playCards/drawCard resolve it.
        next.fiveResponse = true;
        next.currentPlayerIndex = nextIndex;
        next.holdAll = false;
        log.push(`${player.name} played a 5 — ${players[nextIndex].name} must draw 3 cards or play a 5 to pass it on!`);
        next.log = log;
        next.jumpCount = 0;
        return next;
    }
    else if (cardValue === 14) {
        // All players except the current player draw 1 card; current player plays again.
        for (let i = 0; i < players.length; i++) {
            if (i !== playerIndex && players[i].active) {
                ({ deck, players, log } = drawCardsForPlayer(deck, players, i, 1, log));
            }
        }
        log.push(`${player.name} played a 14 — everyone else draws 1 card, and ${player.name} plays again.`);
    }
    next.deck = deck;
    next.players = players;
    next.log = log;
    if (cardValue === 1) {
        // "Hold All": the player keeps the turn and may play any card next.
        next.holdAll = true;
        next.currentPlayerIndex = playerIndex;
        log.push(`${player.name} played a 1 — Hold All! They may play any card.`);
        next.log = log;
    }
    else if (cardValue === 14) {
        // Card 14: the current player plays again.
        next.holdAll = false;
        next.currentPlayerIndex = playerIndex;
        next.log = log;
    }
    else if (cardValue === 8) {
        // 8: skip (hold) the next player entirely. (Star has no special rule.)
        next.holdAll = false;
        next.currentPlayerIndex = skipIndex;
    }
    else if (cardValue === 2 || cardValue === 5) {
        // Cards 2 & 5: the player who drew the penalty is skipped; the player after them plays.
        next.holdAll = false;
        next.currentPlayerIndex = afterIndex;
    }
    else {
        next.holdAll = false;
        next.currentPlayerIndex = nextIndex;
    }
    next.jumpCount = 0;
    return next;
}
/** Returns whether the game is over after this play. */
function playCard(state, playerIndex, card, chosenShape) {
    const player = state.players[playerIndex];
    const hand = player.hand.filter((c) => c.id !== card.id);
    const next = {
        ...state,
        players: state.players.map((p, i) => i === playerIndex ? { ...p, hand } : p),
    };
    // Add to log
    const newTop = { ...card };
    next.topCard = newTop;
    next.deck = [...state.deck];
    next.log = [...state.log];
    // Previous top card joins the discard pile.
    next.discardPile = [...state.discardPile, state.topCard];
    next.log.push(`${player.name} played ${describeCard(card)}.`);
    // Determine shape now in effect
    let effectiveShape = card.shape;
    if (card.shape === "whot") {
        effectiveShape = chosenShape ?? card.shape;
        next.log.push(`${player.name} changed the shape to ${effectiveShape}s.`);
    }
    // Whot cards: the current player picks the shape -> set pending shape selection
    if (card.shape === "whot") {
        next.pendingShapeSelection = true;
        return next;
    }
    // If the player emptied their hand, the round is over (they win the round).
    if (hand.length === 0) {
        next.roundOver = true;
        next.roundWinnerIndex = playerIndex;
        next.currentPlayerIndex = playerIndex;
        return next;
    }
    const cardValue = card.value;
    const n = state.players.length;
    // The immediate next player in the current direction.
    const nextIndex = (playerIndex + state.direction + n) % n;
    // The player who plays after the penalty row (skipping the drawn player).
    const afterIndex = (nextIndex + state.direction + n) % n;
    // For skip cards (star / 8), the turn jumps to the player after the next one.
    const skipIndex = (playerIndex + 2 * state.direction + n) % n;
    let deck = next.deck;
    let players = next.players;
    let log = [...next.log];
    if (cardValue === 2) {
        // Next player draws 2 cards and does NOT play; the player after them plays.
        ({ deck, players, log } = drawCardsForPlayer(deck, players, nextIndex, 2, log));
        log.push(`${player.name} played a 2 — ${players[nextIndex].name} draws 2 cards and is skipped.`);
    }
    else if (cardValue === 5) {
        // A 5 challenges the next player: they may respond with their own 5 to
        // escape the draw-3 penalty (passing it along), or draw 3 cards.
        next.fiveResponse = true;
        next.currentPlayerIndex = nextIndex;
        next.holdAll = false;
        log.push(`${player.name} played a 5 — ${players[nextIndex].name} must draw 3 cards or play a 5 to pass it on!`);
        next.log = log;
        next.jumpCount = 0;
        return next;
    }
    else if (cardValue === 14) {
        // All players except the current player draw 1 card; current player plays again.
        for (let i = 0; i < players.length; i++) {
            if (i !== playerIndex && players[i].active) {
                ({ deck, players, log } = drawCardsForPlayer(deck, players, i, 1, log));
            }
        }
        log.push(`${player.name} played a 14 — everyone else draws 1 card, and ${player.name} plays again.`);
    }
    next.deck = deck;
    next.players = players;
    next.log = log;
    if (cardValue === 1) {
        // "Hold All": the player keeps the turn and may play any card next.
        next.holdAll = true;
        next.currentPlayerIndex = playerIndex;
        log.push(`${player.name} played a 1 — Hold All! They may play any card.`);
        next.log = log;
    }
    else if (cardValue === 14) {
        // Card 14: the current player plays again.
        next.holdAll = false;
        next.currentPlayerIndex = playerIndex;
        next.log = log;
    }
    else if (cardValue === 8) {
        // 8: skip (hold) the next player entirely. (Star has no special rule.)
        next.holdAll = false;
        next.currentPlayerIndex = skipIndex;
    }
    else if (cardValue === 2 || cardValue === 5) {
        // Cards 2 & 5: the player who drew the penalty is skipped; the player after them plays.
        next.holdAll = false;
        next.currentPlayerIndex = afterIndex;
    }
    else {
        next.holdAll = false;
        next.currentPlayerIndex = nextIndex;
    }
    next.jumpCount = 0;
    return next;
}
/**
 * Draws `count` cards from the deck, adding them to the given player's hand.
 * Returns new deck, players, and log arrays (immutably).
 */
function drawCardsForPlayer(deck, players, playerIndex, count, log) {
    const newDeck = [...deck];
    let newPlayers = [...players];
    let newLog = [...log];
    const playerName = players[playerIndex].name;
    for (let n = 0; n < count; n++) {
        if (newDeck.length === 0) {
            newLog = [...newLog, `${playerName} couldn't draw (deck empty).`];
            break;
        }
        const drawn = newDeck.pop();
        newPlayers = newPlayers.map((p, i) => i === playerIndex ? { ...p, hand: [...p.hand, drawn] } : p);
    }
    return { deck: newDeck, players: newPlayers, log: newLog };
}
/** Draw a card for a player. Returns updated state. */
function drawCard(state, playerIndex) {
    // If the current player is responding to a played 5 and chooses to draw
    // instead of playing their own 5, they must draw the 3-card penalty and the
    // turn passes to the player after them.
    if (state.fiveResponse) {
        const n = state.players.length;
        const afterIndex = (playerIndex + state.direction + n) % n;
        let deck = [...state.deck];
        const discardPile = [...state.discardPile];
        let players = state.players;
        let log = [...state.log];
        ({ deck, players, log } = drawCardsForPlayer(deck, players, playerIndex, 3, log));
        log.push(`${players[playerIndex].name} drew 3 cards (couldn't/wouldn't play a 5).`);
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
            deck = (0, deck_1.shuffle)(discardPile);
            discardPile = [];
            const log = [
                ...state.log,
                `Deck empty — reshuffled the discard pile into the deck.`,
            ];
            const reshuffled = { ...state, deck, discardPile, log };
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
    const drawn = deck.pop();
    const players = state.players.map((p, i) => i === playerIndex ? { ...p, hand: [...p.hand, drawn] } : p);
    const next = {
        ...state,
        players,
        deck,
        log: [...state.log, `${player.name} drew a card.`],
    };
    // Could immediately play the drawn card if it matches; we keep it simple:
    // player keeps the drawn card, turn passes.
    return advanceTurn(next, playerIndex);
}
function advanceTurn(state, playerIndex) {
    if (state.gameOver || state.roundOver)
        return state;
    const n = state.players.length;
    // Find the next active player after the current one (wrapping around).
    let nextIndex = (playerIndex + state.direction + n) % n;
    let guard = 0;
    while (!state.players[nextIndex].active && guard < n) {
        nextIndex = (nextIndex + state.direction + n) % n;
        guard++;
    }
    return {
        ...state,
        currentPlayerIndex: nextIndex,
        jumpCount: 0,
        holdAll: false,
    };
}
/** Ends the current player's turn (used to stop a "Hold All" run). */
function endTurn(state, playerIndex) {
    return advanceTurn(state, playerIndex);
}
/** Computes the total face value of a player's hand (Whot = 20). */
function handValue(hand) {
    return hand.reduce((sum, c) => sum + (c.value ?? 20), 0);
}
/**
 * Called after a round ends. In "1v1" mode, the round winner is immediately
 * crowned the overall champion. In "elimination" mode, the active (non-winner)
 * player with the highest hand total is eliminated, then either the next round
 * starts or the overall winner is crowned if only one player remains.
 */
function nextRound(state) {
    if (!state.roundOver)
        return state;
    const roundWinnerIndex = state.roundWinnerIndex;
    const roundWinnerName = roundWinnerIndex !== null ? state.players[roundWinnerIndex].name : null;
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
    const candidates = state.players.filter((p) => p.active && p.name !== roundWinnerName);
    // Determine the highest hand total among candidates.
    let highest = -1;
    let eliminated = null;
    for (const p of candidates) {
        const total = handValue(p.hand);
        if (total > highest) {
            highest = total;
            eliminated = p;
        }
    }
    let players = state.players.map((p) => ({ ...p, hand: [] }));
    let log = [...state.log];
    let lastElimination = null;
    let remaining = players.filter((p) => p.active);
    if (eliminated) {
        const eliminatedName = eliminated.name;
        players = players.map((p) => p.name === eliminatedName ? { ...p, active: false } : p);
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
    const names = players
        .filter((p) => p.active)
        .map((p) => ({ name: p.name, isHuman: p.isHuman }));
    const fresh = dealRound(names, roundNumber, state.mode);
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
 * Returns a short, dramatic rule message for a played card, or null if the
 * card has no special rule. Used to show a pop-up notification in the UI.
 */
function ruleMessage(card) {
    if (card.shape === "whot")
        return "WHOT! Pick a new shape 🔥";
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
/** AI chooses a card to play. Returns null if none can be played. */
function chooseAiCard(hand, topCard, currentShape, holdAll) {
    const shape = currentShape ?? topCard.shape;
    // During "Hold All", the AI may play any card.
    const playable = holdAll
        ? [...hand]
        : hand.filter((c) => canPlay(c, topCard, shape));
    if (playable.length === 0)
        return null;
    // Favor playing Whot only if it's the only option, otherwise keep it.
    const nonWhot = playable.filter((c) => c.shape !== "whot");
    if (nonWhot.length > 0) {
        // Prefer 8s to skip opponents
        const eights = nonWhot.filter((c) => c.value === 8);
        if (eights.length > 0)
            return eights[0];
        return nonWhot[0];
    }
    return playable[0];
}
