interface WhotCardProps {
  className?: string;
}

export default function WhotCard({ className = "" }: WhotCardProps) {
  return (
    <svg
      viewBox="0 0 240 340"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Card Base */}
      <rect width="240" height="340" rx="18" fill="#F4F4F0" />

      {/* Top-Left Corner Identifiers */}
      <g transform="translate(34, 42)">
        {/* Main 20 Index */}
        <text
          x="0"
          y="0"
          fontFamily="'Times New Roman', Times, serif"
          fontSize="38"
          fontWeight="bold"
          fill="#6A0DAD"
          textAnchor="middle"
        >
          20
        </text>
        {/* Rotated/Inverted 'w' directly underneath */}
        <text
          x="0"
          y="16"
          fontFamily="'Times New Roman', Times, serif"
          fontSize="16"
          fontWeight="bold"
          fill="#6A0DAD"
          textAnchor="middle"
          transform="rotate(180, 0, 12)"
        >
          w
        </text>
      </g>

      {/* Bottom-Right Corner Identifiers (Inverted 180 degrees) */}
      <g transform="translate(206, 298) rotate(180)">
        {/* Main 20 Index */}
        <text
          x="0"
          y="0"
          fontFamily="'Times New Roman', Times, serif"
          fontSize="38"
          fontWeight="bold"
          fill="#6A0DAD"
          textAnchor="middle"
        >
          20
        </text>
        {/* Rotated/Inverted 'w' directly underneath */}
        <text
          x="0"
          y="16"
          fontFamily="'Times New Roman', Times, serif"
          fontSize="16"
          fontWeight="bold"
          fill="#6A0DAD"
          textAnchor="middle"
          transform="rotate(180, 0, 12)"
        >
          w
        </text>
      </g>

      {/* Central Double-Logo Graphic */}
      <g transform="translate(120, 170)">
        {/* Top "Whot" Logo (Rotated upside down) */}
        <g transform="translate(0, -6) rotate(180)">
          <text
            x="0"
            y="0"
            fontFamily="'Georgia', 'Times New Roman', serif"
            fontSize="34"
            fontWeight="bold"
            fill="#6A0DAD"
            textAnchor="middle"
          >
            Whot
          </text>
        </g>
        {/* Bottom "Whot" Logo (Right-side up) */}
        <g transform="translate(0, 24)">
          <text
            x="0"
            y="0"
            fontFamily="'Georgia', 'Times New Roman', serif"
            fontSize="34"
            fontWeight="bold"
            fill="#6A0DAD"
            textAnchor="middle"
          >
            Whot
          </text>
        </g>
      </g>
    </svg>
  );
}
