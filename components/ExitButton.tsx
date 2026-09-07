"use client";

import { useState } from "react";

// Long enough for the window to actually go if it is going to.
const CLOSE_GRACE = 400;

/**
 * "Exit" control for the start screen.
 *
 * A page is only allowed to close itself when it is the only entry in its own
 * history — which an installed app is, and a tab the player reached through
 * other pages is not. There is no way to ask in advance, so the attempt is
 * made and, if the window is still here a moment later, the player is told
 * what to do instead. A button that silently did nothing would be worse than
 * no button.
 */
export default function ExitButton() {
  const [refused, setRefused] = useState(false);

  function exit() {
    setRefused(false);
    window.close();
    window.setTimeout(() => {
      if (!window.closed) setRefused(true);
    }, CLOSE_GRACE);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={exit}
        className="rounded-xl border border-red-400/50 bg-red-500/15 px-5 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/30"
      >
        🚪 Exit Whot!
      </button>
      {refused && (
        <p className="max-w-xs text-center text-xs text-emerald-200">
          This browser won&apos;t let a page close itself — close the tab to
          leave. Install Whot! and Exit works properly.
        </p>
      )}
    </div>
  );
}
