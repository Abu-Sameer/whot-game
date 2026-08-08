interface DeckCardProps {
  className?: string;
  count?: number;
}

export default function DeckCard({ className = "", count = 0 }: DeckCardProps) {
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 250 380"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="250" height="380" rx="14" ry="14" fill="#a05d56" />

        <g transform="translate(125, 190)">
          <g transform="translate(0, -5)">
            <text
              x="0"
              y="0"
              fontFamily="'Georgia', 'Times New Roman', serif"
              fontSize="52"
              fontWeight="bold"
              fill="#ffffff"
              textAnchor="middle"
              letterSpacing="-1"
            >
              Whot
            </text>
            <path
              d="M -72 -12 C -80 -12, -82 -6, -74 -3 C -68 0, -64 -6, -72 -12 Z"
              fill="#ffffff"
            />
            <path
              d="M -75 -4 C -82 -4, -82 1, -76 2 C -72 3, -70 -1, -75 -4 Z"
              fill="#ffffff"
            />
            <circle cx="21" cy="-44" r="3" fill="#ffffff" />
          </g>

          <g transform="rotate(180) translate(0, -5)">
            <text
              x="0"
              y="0"
              fontFamily="'Georgia', 'Times New Roman', serif"
              fontSize="52"
              fontWeight="bold"
              fill="#ffffff"
              textAnchor="middle"
              letterSpacing="-1"
            >
              Whot
            </text>
            <path
              d="M -72 -12 C -80 -12, -82 -6, -74 -3 C -68 0, -64 -6, -72 -12 Z"
              fill="#ffffff"
            />
            <path
              d="M -75 -4 C -82 -4, -82 1, -76 2 C -72 3, -70 -1, -75 -4 Z"
              fill="#ffffff"
            />
            <circle cx="21" cy="-44" r="3" fill="#ffffff" />
          </g>
        </g>
      </svg>
      <span className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-sm font-bold text-white drop-shadow">
        {count} cards
      </span>
    </div>
  );
}
