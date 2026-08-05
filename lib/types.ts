export type Shape = "circle" | "cross" | "square" | "star" | "triangle" | "whot";

export interface Card {
  id: string;
  shape: Shape;
  // For whot cards, value is null. For numbered cards, value is 1-14.
  value: number | null;
}

export interface Player {
  name: string;
  hand: Card[];
  isHuman: boolean;
}
