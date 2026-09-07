import type { MetadataRoute } from "next";

// manifest.ts compiles to a Route Handler; a static export needs it pinned
// to build time rather than left request-dependent.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Whot! Nigerian Card Game",
    short_name: "Whot!",
    description:
      "The classic Nigerian Whot card game. Play against the computer in 1v1 or knock-out elimination mode. Works fully offline.",
    id: "/",
    start_url: "/",
    scope: "/",
    // "standalone" gives the installed app its own window with no browser
    // chrome, on phones and on desktop alike.
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    // The table is a landscape layout, so an installed app should launch
    // that way round and stay there.
    orientation: "landscape",
    background_color: "#064e3b",
    theme_color: "#064e3b",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Maskable icons keep the artwork inside the safe zone so Android can
      // apply its own shape mask without clipping the card.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
