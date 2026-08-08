interface CircleCardProps {
  className?: string;
  value?: number | null;
}

export default function CircleCard({
  className = "",
  value = 0,
}: CircleCardProps) {
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
      <circle fill="#7D1228" cx="97.8" cy="127.8" r="57.2" />
      <circle fill="#7D1228" cx="23.6" cy="54.5" r="9.3" />
      <text
        transform="matrix(1 0 0 1 15.942 31.6153)"
        fill="#791026"
        fontFamily="MyriadPro-Regular"
        fontSize="40"
      >
        {value}
      </text>
      <circle fill="#7D1228" cx="155.1" cy="198.2" r="12" />
      <text
        transform="matrix(1 0 0 1 147.3851 236.655)"
        fill="#791026"
        fontFamily="MyriadPro-Regular"
        fontSize="40"
      >
        {value}
      </text>
    </svg>
  );
}
