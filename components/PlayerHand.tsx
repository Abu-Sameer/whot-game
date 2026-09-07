"use client";

import { useEffect, useRef, useState } from "react";
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
  /** True while the round is still being dealt, so arriving cards animate in. */
  dealing?: boolean;
}

// Card size "lg" is w-28 (7rem) wide, and cards sit 0.5rem apart when the hand
// is small enough for them not to touch.
const CARD_REM = 7;
const GAP_REM = 0.5;
// A card's number and shape marker live in its top-left corner, inside the
// first third of its width. Cards overlap leftwards, so as long as this much
// of each one stays uncovered the whole hand is still readable.
const MIN_VISIBLE = 0.34;

export default function PlayerHand({
  cards,
  isActive,
  isHuman,
  playableIds,
  selectedIds,
  selectedValue,
  onSelect,
  dealing = false,
}: PlayerHandProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Margin between cards, in px. Negative once they have to overlap. Starts at
  // the plain gap so the first paint (and the server's HTML) looks right for
  // the small hands that need no overlap at all.
  const [margin, setMargin] = useState(0);

  const count = cards.length;

  // The hand has to stay on one row: wrapping it would eat the height the rest
  // of the table needs, which is exactly what the board cannot spare on a
  // phone. So once the cards no longer fit side by side they slide over each
  // other instead, as far as it takes and no further.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const card = CARD_REM * rem;
      const loose = card + GAP_REM * rem;
      if (count < 2) {
        setMargin(GAP_REM * rem);
        return;
      }
      // The last card is always drawn whole, so only the other n-1 have to fit
      // their step into the row.
      const step = (row.clientWidth - card) / (count - 1);
      setMargin(
        Math.max(card * MIN_VISIBLE, Math.min(loose, step)) - card,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [count]);

  return (
    // pt leaves room for the lift a selected or hovered card rises by.
    <div ref={rowRef} className="flex items-end justify-center pt-3">
      {cards.map((card, i) => {
        const playable =
          isActive &&
          isHuman &&
          (playableIds.has(card.id) ||
            // Allow selecting an already-highlighted same-numbered card even
            // if its shape doesn't match the top card.
            (selectedValue !== null && card.value === selectedValue));
        const selected = selectedIds.has(card.id);
        return (
          <CardView
            key={card.id}
            card={card}
            size="lg"
            playable={playable}
            selected={selected}
            onClick={playable ? () => onSelect(card) : undefined}
            // Cards later in the hand overlap the ones before them, so a card
            // being picked has to come up out of the fan to be seen whole.
            className={`shrink-0 ${selected ? "z-20" : "hover:z-10"} ${
              dealing ? "deal-in" : ""
            }`}
            style={{ marginLeft: i === 0 ? 0 : margin }}
          />
        );
      })}
    </div>
  );
}
