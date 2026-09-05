"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** The Chromium-only event that lets us trigger the install prompt ourselves. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Nothing to subscribe to: the value is fixed for the life of the page. */
const noSubscribe = () => () => {};

/** True when the page is running as an installed app rather than in a tab. */
function useIsStandalone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(display-mode: standalone)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS reports installed apps through a non-standard navigator flag.
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    // Prerendered HTML has no window; assume a tab and let the client correct it.
    () => false,
  );
}

/** True on iPhone/iPad, which have no install API and need manual steps. */
function useIsIos(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () =>
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window),
    () => false,
  );
}

/**
 * "Install app" control for the start screen.
 *
 * On Chromium (Android, Windows, macOS, Linux) this fires the real install
 * prompt. Safari and iOS have no such API, so those users get the manual
 * steps instead. Once installed, the whole thing disappears.
 */
export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [justInstalled, setJustInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isStandalone = useIsStandalone();
  const isIos = useIsIos();

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Suppress the mini-infobar so the button below is the only prompt.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone || justInstalled) return null;
  // No prompt available and not iOS: the browser either cannot install this or
  // has already decided not to offer it. A dead button would be worse.
  if (!deferred && !isIos) return null;

  async function handleInstall() {
    if (!deferred) {
      setShowIosHelp((v) => !v);
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    // The prompt is single-use; drop it whatever the player chose.
    setDeferred(null);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleInstall}
        className="rounded-xl border border-amber-400/70 bg-amber-400/15 px-5 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-400/30"
      >
        ⬇ Install Whot! on this device
      </button>
      {showIosHelp && (
        <p className="max-w-xs text-center text-xs text-emerald-200">
          Tap the Share button <span aria-hidden>⎋</span> at the bottom of
          Safari, then choose <strong>Add to Home Screen</strong>{" "}
          <span aria-hidden>➕</span>.
        </p>
      )}
    </div>
  );
}
