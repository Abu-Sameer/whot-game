import type { Card, Shape } from "./types";

const NUMBER_SHAPES: Shape[] = [
  "circle",
  "cross",
  "square",
  "star",
  "triangle",
];
const MAX_VALUE = 14;

/**
 * Build a standard 54-card Whot deck:
 * - Cards for each shape (circle, cross, square, star, triangle) with values 1-14.
 * - 4 Whot (wild) cards.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;

  for (const shape of NUMBER_SHAPES) {
    for (let value = 1; value <= MAX_VALUE; value++) {
      deck.push({ id: `card-${id++}`, shape, value });
    }
  }

  // 4 Whot cards
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `card-${id++}`, shape: "whot", value: null });
  }

  return deck;
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
