// Sound utilities for the Whot game.
// All MP3/WAV files live in /public/gamesound/.

const SOUND_BASE = "/gamesound";

// Several of the spoken lines are named with spaces, which are not legal in a
// URL, so every filename goes through the encoder rather than only the ones
// that happen to need it today.
const file = (name: string) => `${SOUND_BASE}/${encodeURIComponent(name)}`;

const SOUNDS: Record<string, string> = {
  start: file("Startnewgame.wav"),
  playCard: file("whenplayerplaycard.wav"),
  solve: file("whensolvingcard.mp3"),
  win: file("whenplayerwins.wav"),
  lose: file("whenuserlose.wav"),
  drawCard: file("whenplayerdrawcard.mp3"),
  // drawPenalty: file("whenplayeristodraw2or3cardsfromdeck.mp3"),
  levelWin: file("whenplayerwinlevelinelimination.mp3"),

  // Spoken calls, the way they are called at a real table. Played through
  // speak() rather than playSound() so they never talk over each other.
  letTheGameBegin: file("let the game begin.mp3"),
  mode1v1: file("1 versus 1 mode selected.mp3"),
  modeElimination: file("elimination mode selected.mp3"),
  howManyPlayers: file("select how many player you want to play with.mp3"),
  pick2: file("pick 2.mp3"),
  pick3: file("pick 3.mp3"),
  reject: file("reject.mp3"),
  generalMarket: file("general market.mp3"),
  suspension: file("suspension.mp3"),
  holdAll: file("hold all.mp3"),
  iNeed: file("i need.mp3"),
  doubleNumber: file("double number.mp3"),
  lastCard: file("last card.mp3"),
  checkUp: file("check up.mp3"),
  continue: file("continue.mp3"),
  market: file("market.mp3"),

  // The shapes, said once a Whot has named one. Keyed by the Shape values
  // themselves, so speak(shape) is all the call site needs.
  circle: file("circle.mp3"),
  cross: file("cross.mp3"),
  square: file("square.mp3"),
  star: file("star.mp3"),
  triangle: file("triangle.mp3"),
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
    // Anything already running has to stop now rather than play itself out.
    for (const key of Object.keys(cached)) stopSoundLoop(key);
    stopSpeaking();
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

// ---------------------------------------------------------------- spoken calls

// The spoken lines take turns instead of overlapping, because two of them at
// once is just noise — and the game readily produces two at once: a mode being
// chosen while the next screen introduces itself, or a rule call landing on
// top of the one before it.
let speaking: HTMLAudioElement | null = null;
const pending: string[] = [];

// A queue any longer than this is a queue that has fallen behind the game, and
// hearing a call for a move that happened four turns ago is worse than not
// hearing it at all.
const MAX_PENDING = 2;

function speakNext(): void {
  const key = pending.shift();
  if (!key) {
    speaking = null;
    return;
  }
  const src = SOUNDS[key];
  if (!src) {
    speakNext();
    return;
  }
  const audio = new Audio(src);
  speaking = audio;
  audio.volume = 0.85;
  const done = () => {
    if (speaking !== audio) return;
    speaking = null;
    speakNext();
  };
  audio.addEventListener("ended", done);
  // Without this a missing or unplayable file would stall the queue for good.
  audio.addEventListener("error", done);
  void audio.play().catch(done);
}

/** Says one of the game's calls, after any already being said. */
export function speak(key: keyof typeof SOUNDS | string): void {
  if (typeof window === "undefined") return;
  if (!soundOn) return;
  if (!SOUNDS[key]) return;
  if (pending.length >= MAX_PENDING) pending.shift();
  pending.push(String(key));
  if (!speaking) speakNext();
}

/** Cuts off whatever is being said and drops anything waiting. */
export function stopSpeaking(): void {
  pending.length = 0;
  const audio = speaking;
  speaking = null;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
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
