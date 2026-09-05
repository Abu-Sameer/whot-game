/**
 * Generates the PWA icon set into public/icons/ from an inline SVG source.
 *
 * Run with: npm run icons
 *
 * `sharp` is not a direct dependency — it ships with Next.js and is resolved
 * from node_modules. The generated PNGs are committed, so this script only
 * needs to be re-run when the artwork changes.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_DIR = new URL("../public/icons/", import.meta.url);

// Palette lifted from the game board (emerald table, amber highlights).
const DEEP = "#043d2e";
const EMERALD = "#0b6b4f";
const AMBER = "#fbbf24";
const CARD = "#fdfcf7";
const RED = "#dc2626";

/**
 * The artwork. `pad` is the fraction of the canvas kept clear around the card:
 * regular icons sit close to the edge, maskable icons stay inside the safe
 * zone (the centre 80% circle) so platform masks never clip the card.
 */
function svg(size, pad, rounded) {
  const r = rounded ? size * 0.22 : 0;
  // Card geometry, centred, standard playing-card ratio.
  const cardH = size * (1 - pad * 2);
  const cardW = cardH * 0.7;
  const cardX = (size - cardW) / 2;
  const cardY = (size - cardH) / 2;
  const cr = cardW * 0.12;
  const cx = size / 2;
  const cy = size / 2;

  // Five-pointed star, drawn from the centre of the card.
  const starR = cardW * 0.42;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? starR : starR * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${EMERALD}"/>
      <stop offset="100%" stop-color="${DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <!-- Card peeking out behind, tilted. -->
  <g transform="rotate(-14 ${cx} ${cy})" opacity="0.55">
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cr}"
          fill="${CARD}" stroke="${DEEP}" stroke-width="${size * 0.012}"/>
  </g>
  <!-- Front card. -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cr}"
        fill="${CARD}" stroke="${AMBER}" stroke-width="${size * 0.018}"/>
  <polygon points="${pts.join(" ")}" fill="${RED}"/>
</svg>`;
}

const TARGETS = [
  // [filename, pixel size, padding fraction, rounded corners]
  ["icon-192.png", 192, 0.1, true],
  ["icon-512.png", 512, 0.1, true],
  ["icon-maskable-192.png", 192, 0.22, false],
  ["icon-maskable-512.png", 512, 0.22, false],
  // iOS home screen. Must be square, opaque, and un-rounded (iOS masks it).
  ["apple-touch-icon.png", 180, 0.12, false],
];

await mkdir(OUT_DIR, { recursive: true });

for (const [name, size, pad, rounded] of TARGETS) {
  const buf = Buffer.from(svg(size, pad, rounded));
  await sharp(buf).png().toFile(fileURLToPath(new URL(name, OUT_DIR)));
  console.log("wrote", "public/icons/" + name, `(${size}x${size})`);
}

// Keep the vector around so the artwork can be tweaked without re-deriving it.
await writeFile(new URL("icon.svg", OUT_DIR), svg(512, 0.1, true));
console.log("wrote public/icons/icon.svg");
