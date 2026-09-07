import type { CSSProperties } from "react";
import type { Card as CardType, Shape } from "@/lib/types";
import CircleCard from "./CircleCard";
import CrossCard from "./CrossCard";
import SquareCard from "./SquareCard";
import StarCard from "./StarCard";
import TriangleCard from "./TriangleCard";
import WhotCard from "./WhotCard";

const SHAPE_COLORS: Record<Shape, string> = {
  circle: "bg-white",
  cross: "bg-blue-500",
  square: "bg-green-500",
  star: "bg-yellow-400 text-black",
  triangle: "bg-purple-500",
  whot: "bg-gradient-to-br from-amber-400 to-orange-600",
};

const SHAPE_LABEL: Record<Shape, string> = {
  circle: "●",
  cross: "✚",
  square: "■",
  star: "★",
  triangle: "▲",
  whot: "WHOT",
};

interface CardProps {
  card: CardType;
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  // Lets the caller place the card — the human's hand fans its cards with a
  // computed margin so a big hand stays on one row.
  style?: CSSProperties;
}

const SIZE_STYLES = {
  sm: "w-12 h-[4.5rem] text-xs",
  md: "w-20 h-28 text-base",
  lg: "w-28 h-40 text-xl",
};

export default function CardView({
  card,
  selected = false,
  playable = true,
  onClick,
  faceDown = false,
  size = "md",
  className = "",
  style,
}: CardProps) {
  if (faceDown) {
    return (
      <div
        className={`${SIZE_STYLES[size]} rounded-xl border-2 border-zinc-700 bg-linear-to-br from-zinc-600 to-zinc-800 shadow-md ${className}`}
        style={style}
      />
    );
  }

  const colorClass = SHAPE_COLORS[card.shape];
  const label = SHAPE_LABEL[card.shape];

  const renderShapeSvg = () => {
    const svgProps = {
      className: "pointer-events-none absolute inset-0 h-full w-full",
      value: card.value,
    };
    switch (card.shape) {
      case "circle":
        return <CircleCard {...svgProps} />;
      case "cross":
        return <CrossCard {...svgProps} />;
      case "square":
        return <SquareCard {...svgProps} />;
      case "star":
        return <StarCard {...svgProps} />;
      case "triangle":
        return <TriangleCard {...svgProps} />;
      default:
        return null;
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={style}
      className={`${SIZE_STYLES[size]} relative flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 shadow-md transition-transform font-bold ${
        selected
          ? "border-indigo-500 -translate-y-2 ring-2 ring-indigo-400"
          : "border-zinc-300"
      } ${onClick && playable ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg" : ""} ${
        onClick && !playable ? "opacity-40 cursor-not-allowed" : ""
      } ${colorClass} ${className}`}
    >
      {card.shape === "whot" ? (
        <WhotCard className="pointer-events-none absolute inset-0 h-full w-full" />
      ) : (
        renderShapeSvg()
      )}
      {onClick && playable && (
        <span className="pointer-events-none absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
      )}
    </button>
  );
}
