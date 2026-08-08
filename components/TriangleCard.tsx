interface TriangleCardProps {
  className?: string;
  value?: number | null;
}

export default function TriangleCard({
  className = "",
  value = 0,
}: TriangleCardProps) {
  return (
    <svg
      viewBox="0 0 186.3 255.5"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#F4F4F2"
        stroke="#000000"
        d="M182.9,237.7c0,7.8-6.3,14.2-14.2,14.2H18.5c-7.8,0-14.2-6.3-14.2-14.2V16.6c0-7.8,6.3-14.2,14.2-14.2h150.2c7.8,0,14.2,6.3,14.2,14.2V237.7z"
      />
      <text
        transform="matrix(1 0 0 1 13.2988 34.2585)"
        fill="#791026"
        fontFamily="MyriadPro-Regular"
        fontSize="40"
      >
        {value}
      </text>
      <text
        transform="matrix(1 0 0 1 143.3851 236.655)"
        fill="#791026"
        fontFamily="MyriadPro-Regular"
        fontSize="40"
      >
        {value}
      </text>
      <g transform="translate(40, 75) scale(2)">
        <polygon
          stroke="#791026"
          points="25,0 0,48 50,48"
          strokeWidth="2"
          fill="#791026"
        />
      </g>
      <g transform="translate(13, 42) scale(0.4)">
        <polygon
          stroke="#791026"
          points="25,0 0,48 50,48"
          strokeWidth="5"
          fill="#791026"
        />
      </g>
      <g transform="translate(166.5, 210) scale(0.4) rotate(180)">
        <polygon
          stroke="#791026"
          points="25,0 0,48 50,48"
          strokeWidth="5"
          fill="#791026"
        />
      </g>
    </svg>
  );
}
