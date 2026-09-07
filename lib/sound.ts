// Sound utilities for the Whot game.
// All MP3/WAV files live in /public/gamesound/.

const SOUND_BASE = "/gamesound";

const SOUNDS: Record<string, string> = {
  start: `${SOUND_BASE}/Startnewgame.wav`,
  playCard: `${SOUND_BASE}/whenplayerplaycard.wav`,
  solve: `${SOUND_BASE}/whensolvingcard.mp3`,
  win: `${SOUND_BASE}/whenplayerwins.wav`,
  lose: `${SOUND_BASE}/whenuserlose.wav`,
  drawCard: `${SOUND_BASE}/whenplayerdrawcard.mp3`,
  // drawPenalty: `${SOUND_BASE}/whenplayeristodraw2or3cardsfromdeck.mp3`,
  levelWin: `${SOUND_BASE}/whenplayerwinlevelinelimination.mp3`,
};

let audioContext: AudioContext | null = null;
const cached: Record<string, HTMLAudioElement> = {};

// Whether the game makes any noise. Held here rather than passed down to every
// caller: sounds are fired from a dozen places and none of them should have to
// know or care about the setting. The settings screen owns it and pushes it in.
let soundOn = true;

/** Switches every sound in the game on or off. */
export function setSoundEnabled(on: boolean): void {
  soundOn = on;
  if (!on) {
    // Anything already looping has to be stopped now rather than left running
    // until it happens to be asked to stop.
    for (const key of Object.keys(cached)) stopSoundLoop(key);
  }
}

export function isSoundEnabled(): boolean {
  return soundOn;
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) audioContext = new Ctor();
  }
  return audioContext;
}

/** Unlock the AudioContext on the first user gesture (browser autoplay policy). */
export function unlockAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

/**
 * Play a sound by key. Uses a fresh HTMLAudioElement each time so rapid
 * plays (e.g. chaining cards) overlap correctly.
 */
export function playSound(key: keyof typeof SOUNDS | string): void {
  if (typeof window === "undefined") return;
  if (!soundOn) return;
  const src = SOUNDS[key];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.6;
  void audio.play().catch(() => {
    /* ignore autoplay blocks; user gesture will unlock later */
  });
}

/** Play a sound, reusing a cached element (good for ambient/looping). */
export function playSoundLoop(key: keyof typeof SOUNDS | string): void {
  if (typeof window === "undefined") return;
  if (!soundOn) return;
  const src = SOUNDS[key];
  if (!src) return;
  if (!cached[key]) {
    cached[key] = new Audio(src);
    cached[key].loop = true;
    cached[key].volume = 0.5;
  }
  void cached[key].play().catch(() => {});
}

export function stopSoundLoop(key: keyof typeof SOUNDS | string): void {
  const el = cached[key];
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
}
