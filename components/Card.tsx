import type { Card as CardType, Shape } from "@/lib/types";

const SHAPE_COLORS: Record<Shape, string> = {
  circle: "bg-red-500",
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
}: CardProps) {
  if (faceDown) {
    return (
      <div
        className={`${SIZE_STYLES[size]} rounded-xl border-2 border-zinc-700 bg-gradient-to-br from-zinc-600 to-zinc-800 shadow-md ${className}`}
      />
    );
  }

  const colorClass = SHAPE_COLORS[card.shape];
  const label = SHAPE_LABEL[card.shape];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`${SIZE_STYLES[size]} relative flex flex-col items-center justify-center rounded-xl border-2 shadow-md transition-transform font-bold ${
        selected
          ? "border-indigo-500 -translate-y-2 ring-2 ring-indigo-400"
          : "border-zinc-300"
      } ${onClick && playable ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg" : ""} ${
        onClick && !playable ? "opacity-40 cursor-not-allowed" : ""
      } ${colorClass} ${className}`}
    >
      <span className="pointer-events-none text-white drop-shadow">
        {label}
      </span>
      {card.shape !== "whot" && (
        <span className="pointer-events-none mt-1 text-sm text-white/90 drop-shadow">
          {card.value}
        </span>
      )}
      {onClick && playable && (
        <span className="pointer-events-none absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
      )}
    </button>
  );
}
