import type { Card as CardType } from "@/lib/types";
import CardView from "./Card";

interface PlayerHandProps {
  cards: CardType[];
  isActive: boolean;
  isHuman: boolean;
  playableIds: Set<string>;
  selectedIds: Set<string>;
  selectedValue: number | null;
  onSelect: (card: CardType) => void;
}

export default function PlayerHand({
  cards,
  isActive,
  isHuman,
  playableIds,
  selectedIds,
  selectedValue,
  onSelect,
}: PlayerHandProps) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-2">
      {cards.map((card) => {
        const playable =
          isActive &&
          isHuman &&
          (playableIds.has(card.id) ||
            // Allow selecting an already-highlighted same-numbered card even
            // if its shape doesn't match the top card.
            (selectedValue !== null && card.value === selectedValue));
        return (
          <CardView
            key={card.id}
            card={card}
            size="lg"
            playable={playable}
            selected={selectedIds.has(card.id)}
            onClick={playable ? () => onSelect(card) : undefined}
          />
        );
      })}
    </div>
  );
}
