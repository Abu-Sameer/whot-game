"use client";

import qrcode from "qrcode-generator";

interface QrCodeProps {
  value: string;
  className?: string;
}

// Quiet zone, in modules. The spec asks for four; two is enough for a code
// held up on a screen and buys back room for bigger modules.
const QUIET = 2;

/**
 * Draws a pairing code as a QR another phone can read.
 *
 * Rendered as one SVG path of squares rather than a canvas or an <img>, so it
 * stays sharp at whatever size the layout gives it — the code runs to several
 * hundred characters, so its modules are small and every bit of crispness
 * counts.
 */
export default function QrCode({ value, className = "" }: QrCodeProps) {
  // Type 0 picks the smallest version the data fits into, and L leaves the
  // most of each version over for data — which is what a code this long needs.
  let qr;
  try {
    qr = qrcode(0, "L");
    qr.addData(value, "Byte");
    qr.make();
  } catch {
    return null;
  }

  const count = qr.getModuleCount();
  const size = count + QUIET * 2;

  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      // Without this the module edges are antialiased into grey mush at small
      // sizes, which is exactly what a scanner cannot read.
      shapeRendering="crispEdges"
      role="img"
      aria-label="Pairing code"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
