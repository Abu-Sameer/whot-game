# Whot!

The classic Nigerian Whot card game — 1v1 or knock-out elimination against the
computer. It is a Next.js app that also installs as a **phone app** and a
**desktop app**, and once installed it runs fully offline.

## Develop

```bash
npm run dev          # http://localhost:3000, hot reload
```

The service worker is only produced by a production build, so `npm run dev`
never has one. That is deliberate — a cached worker in development would serve
you stale code.

## Build and run the app

```bash
npm run build        # static export into out/ + generates out/sw.js
npm start            # serves out/ on http://localhost:3000
```

`npm start` runs `scripts/serve.mjs`, a small static file server. `next start`
cannot be used, because the app builds with `output: "export"` — a folder of
plain files with no server behind it. That is what lets the whole game be
cached and played with no connection.

## Installing it

### Desktop (Windows, macOS, Linux)

1. `npm run build && npm start`
2. Open <http://localhost:3000> in Chrome or Edge.
3. Click the **install icon** in the address bar, or use the
   **⬇ Install Whot! on this device** button on the start screen.

It gets its own window, its own taskbar/dock icon, and its own entry in the
Start menu or Launchpad — no browser chrome, no address bar.

### Android

Serve the build over **https** (see below), open it in Chrome, and use the
install button on the start screen or Chrome's *Add to Home screen*.

### iPhone / iPad

Safari has no install API. Open the site, tap **Share** → **Add to Home
Screen**. The start screen shows these steps when it detects iOS.

### The https requirement

Service workers — and therefore installation and offline play — need a secure
context. `localhost` counts as one, so testing on this machine works over plain
http. A phone loading the `Network:` address printed by `npm start` does not,
so for on-device testing either:

- run a tunnel, e.g. `npx localtunnel --port 3000` or `ngrok http 3000`; or
- deploy `out/` to any static host (GitHub Pages, Netlify, Vercel, Cloudflare
  Pages) — they all serve https by default.

## How the offline support works

- **`app/manifest.ts`** — the web app manifest: name, icons, colours, and
  `display: "standalone"` so the installed app opens in its own window.
- **`scripts/build-sw.mjs`** — runs after `next build` and writes `out/sw.js`.
  It walks the real build output, so the precache list always has the correct
  hashed filenames and covers every asset: HTML, JS, CSS, the self-hosted
  fonts, the board images, and all eight sound files.
- **`components/ServiceWorkerRegistrar.tsx`** — registers the worker and shows
  an **Update** banner when a newer build has been cached, rather than leaving
  players stuck on an old version.
- The cache name is a hash of the build output, so a new build invalidates the
  old cache automatically and the previous one is deleted on activation.

## Icons

`public/icons/` is generated from an inline SVG by:

```bash
npm run icons
```

The PNGs are committed, so this only needs re-running when the artwork in
`scripts/generate-icons.mjs` changes.

## Project layout

| Path | What it is |
| --- | --- |
| `lib/gameLogic.ts` | All Whot rules — dealing, play validation, card effects, elimination |
| `lib/deck.ts` | Deck construction and shuffling |
| `lib/sound.ts` | Sound effect playback |
| `components/WhotGame.tsx` | The board, turn loop, and bot driver |
| `components/PlayerSetup.tsx` | Mode and player-count start screens |
| `app/manifest.ts` | Web app manifest |
| `scripts/` | Icon generation, service worker generation, static server |
