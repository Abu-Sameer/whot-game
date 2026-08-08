interface FaceDownCardProps {
  orientation?: "horizontal" | "vertical";
  size?: "md" | "lg";
  rotate?: number;
}

export default function FaceDownCard({
  orientation = "horizontal",
  size = "md",
  rotate = 0,
}: FaceDownCardProps) {
  const dims =
    orientation === "vertical"
      ? size === "lg"
        ? "h-20 w-14"
        : "h-14 w-10"
      : size === "lg"
        ? "h-16 w-11"
        : "h-12 w-8";

  return (
    <div
      className={`relative overflow-hidden rounded ${dims}`}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <svg
        viewBox="0 0 250 380"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="250" height="380" rx="14" ry="14" fill="#a05d56" />
        <text
          x="125"
          y="210"
          fontFamily="'Georgia', 'Times New Roman', serif"
          fontSize="52"
          fontWeight="bold"
          fill="#ffffff"
          textAnchor="middle"
          letterSpacing="-1"
        >
          Whot
        </text>
      </svg>
    </div>
  );
}
