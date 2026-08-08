interface SquareCardProps {
  className?: string;
  value?: number | null;
}

export default function SquareCard({
  className = "",
  value = 0,
}: SquareCardProps) {
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
      <rect fill="#7D1228" x="33.1" y="67.9" width="121.1" height="121.1" />
      <rect fill="#7D1228" x="11.9" y="45.3" width="21.2" height="18.5" />
      <rect fill="#7D1228" x="144.5" y="195.5" width="21.2" height="18.5" />
    </svg>
  );
}
