"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeck = createDeck;
exports.shuffle = shuffle;
// The exact Whot deck composition.
// - Circle & Triangle: 1,2,3,4,5,7,8,10,11,12,13,14
// - Cross & Square:    1,2,3,5,7,10,11,13,14
// - Star:              1,2,3,4,5,7,8
// - Whot (wild):       5 cards numbered 20
const SHAPE_NUMBERS = [
    { shape: "circle", values: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14] },
    { shape: "triangle", values: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14] },
    { shape: "cross", values: [1, 2, 3, 5, 7, 10, 11, 13, 14] },
    { shape: "square", values: [1, 2, 3, 5, 7, 10, 11, 13, 14] },
    { shape: "star", values: [1, 2, 3, 4, 5, 7, 8] },
];
// Number of Whot (wild) cards in the deck.
const WHOT_CARD_COUNT = 5;
// The value used for Whot cards.
const WHOT_CARD_VALUE = 20;
/**
 * Build the Whot deck:
 * - Circle: 1,2,3,4,5,7,8,10,11,12,13,14
 * - Triangle: 1,2,3,4,5,7,8,10,11,12,13,14
 * - Cross: 1,2,3,5,7,10,11,13,14
 * - Square: 1,2,3,5,7,10,11,13,14
 * - Star: 1,2,3,4,5,7,8
 * - 5 Whot (wild) cards numbered 20
 */
function createDeck() {
    const deck = [];
    let id = 0;
    for (const { shape, values } of SHAPE_NUMBERS) {
        for (const value of values) {
            deck.push({ id: `card-${id++}`, shape, value });
        }
    }
    // 5 Whot cards numbered 20
    for (let i = 0; i < WHOT_CARD_COUNT; i++) {
        deck.push({
            id: `card-${id++}`,
            shape: "whot",
            value: WHOT_CARD_VALUE,
        });
    }
    return deck;
}
/** Fisher-Yates shuffle (returns a new array). */
function shuffle(input) {
    const arr = [...input];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
