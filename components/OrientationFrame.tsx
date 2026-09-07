"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * The frame every screen is drawn inside, and the one place that asks for
 * landscape.
 *
 * A real orientation lock is the good outcome: the browser turns the screen
 * itself and everything below here simply sees a landscape viewport. Browsers
 * only grant it to an installed app or a fullscreen page, though, and iOS
 * never does — so the call is best-effort. When it is refused, the portrait
 * media query in globals.css turns the frame a quarter turn instead, which
 * gets the player the same landscape picture without the browser's help.
 */
// The Screen Orientation API's lock()/unlock() are missing from the DOM types
// this project builds against; every browser that grants a lock has them.
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

export default function OrientationFrame({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    const orientation: LockableOrientation | undefined =
      window.screen?.orientation;
    if (typeof orientation?.lock !== "function") return;

    // lock() rejects rather than throws when it is not allowed here, but a
    // browser that does not know the "landscape" value throws synchronously.
    try {
      orientation.lock("landscape").catch(() => {});
    } catch {
      return;
    }

    return () => {
      try {
        orientation.unlock?.();
      } catch {
        // Nothing was locked; nothing to release.
      }
    };
  }, []);

  return <div className="app-frame flex flex-col">{children}</div>;
}
