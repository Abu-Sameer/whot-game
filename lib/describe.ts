import type { Shape } from "./types";

export function describeShape(shape: Shape): string {
  switch (shape) {
    case "circle":
      return "●";
    case "cross":
      return "✚";
    case "square":
      return "■";
    case "star":
      return "★";
    case "triangle":
      return "▲";
    case "whot":
      return "WHOT";
  }
}
