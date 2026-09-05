import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole game runs client-side, so it builds to a folder of static files.
  // That is what lets the service worker precache everything and run the app
  // with no server and no connection.
  output: "export",
  images: {
    // No image optimisation server exists in a static export.
    unoptimized: true,
  },
};

export default nextConfig;
