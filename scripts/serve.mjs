/**
 * Serves the static export in out/ over http://localhost:3000.
 *
 * `next start` cannot run an `output: "export"` build, and a service worker
 * needs a secure context — localhost counts as one, so this is enough to
 * install the app and test offline play on this machine.
 *
 * Run with: npm start   (after npm run build)
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};

async function resolve(urlPath) {
  // Strip the query/hash, then resolve against out/. path.resolve collapses
  // any ".." so a crafted URL cannot escape the output directory.
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.resolve(OUT, clean.replace(/^[/]+/, ""));
  if (!target.startsWith(path.resolve(OUT))) return null;

  const candidates = [target, target + ".html", path.join(target, "index.html")];
  for (const candidate of candidates) {
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // try the next shape
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const file = (await resolve(req.url || "/")) ?? (await resolve("/index.html"));
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. Did you run `npm run build`?");
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    // The worker must never be served stale, or updates never reach players.
    "Cache-Control": path.basename(file) === "sw.js" ? "no-store" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  };

  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);

  console.log(`\n  Whot! is served from out/\n`);
  console.log(`  Local:    http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Network:  http://${ip}:${PORT}`);
  console.log(
    `\n  Install it from the browser menu (or the in-app button).`,
  );
  console.log(
    `  Note: phones on your network need https to install — see README.\n`,
  );
});
