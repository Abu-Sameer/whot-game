import type { Card } from "@/lib/types";
import CardView from "./Card";

export default function DiscardPile({ topCard }: { topCard: Card }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <CardView card={topCard} size="lg" />
    </div>
  );
}
