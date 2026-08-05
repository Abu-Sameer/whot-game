import type { Card } from "@/lib/types";
import CardView from "./Card";

export default function DiscardPile({ topCard }: { topCard: Card }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Discard
      </span>
      <CardView card={topCard} size="lg" />
    </div>
  );
}
