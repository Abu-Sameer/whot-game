"use client";

import { useEffect, useRef, useState } from "react";
import type { GameMode } from "@/lib/types";
import type { Connection, Pairing } from "@/lib/peer";
import { createGuest, createHost } from "@/lib/peer";
import type { NetMessage, NetRole } from "@/lib/netProtocol";
import { HOST_SEAT, parseMessage } from "@/lib/netProtocol";
import QrCode from "./QrCode";
import QrScanner from "./QrScanner";

/** One guest who has finished pairing and is sitting at the table. */
export interface Joined {
  seat: number;
  name: string;
  connection: Connection;
}

export interface NearbyGame {
  role: NetRole;
  myName: string;
  /** Host: places at the table in total, bots included. */
  numPlayers: number;
  mode: GameMode;
  /** Host: the guests who joined, in seat order. Empty for a guest. */
  guests: Joined[];
  /** Guest: the single link back to the host. */
  host?: Connection;
}

interface NearbyPairingProps {
  onBack: () => void;
  onReady: (game: NearbyGame) => void;
  /** Frames from the other phone, once the game has started. */
  onMessage: (message: unknown, from: number) => void;
  /** A link went down mid-game. A phone going to sleep is enough to do it. */
  onLost: (from: number) => void;
}

const MAX_NAME = 12;
const STORE = "whot-my-name";
const OPTIONS = [2, 3, 4];

const SCREEN =
  "flex h-full flex-col overflow-y-auto bg-cover bg-center text-white";
const PANEL = "m-auto flex w-full max-w-md flex-col p-4";
const CARD = "rounded-2xl border border-white/10 bg-black/70 p-5";
const BUTTON =
  "w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50";
const GHOST =
  "w-full rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10";
const FIELD =
  "w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 font-semibold text-white placeholder:text-emerald-200/40 focus:border-amber-400 focus:outline-none";

type Stage =
  | { kind: "setup" }
  // Host: waiting between invitations, deciding when to deal.
  | { kind: "lobby" }
  // Host: the offer is on screen for the next guest to read.
  | { kind: "inviting"; pairing: Pairing }
  // Host: reading the answer that guest is now showing back.
  | { kind: "confirming"; pairing: Pairing }
  // Guest: reading the host's offer.
  | { kind: "joinScanning" }
  // Guest: the answer is on screen for the host to read.
  | { kind: "joinShowing"; pairing: Pairing }
  // Guest: paired, waiting to be dealt to.
  | { kind: "joined" };

export default function NearbyPairing({
  onBack,
  onReady,
  onMessage,
  onLost,
}: NearbyPairingProps) {
  const [stage, setStage] = useState<Stage>({ kind: "setup" });
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(STORE) ?? "";
    } catch {
      return "";
    }
  });
  const [numPlayers, setNumPlayers] = useState(2);
  const [guests, setGuests] = useState<Joined[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const started = useRef(false);
  // Every connection made on this screen, so abandoning it half-paired cannot
  // leave any of them open.
  const opened = useRef<Connection[]>([]);

  // The handshake finishes inside a channel callback rather than a click
  // handler, and those callbacks outlive this screen — the peer connection
  // holds them, and it keeps running once the board takes over. So the latest
  // values are parked here, written after each render rather than during one.
  const latest = useRef({ name, numPlayers, guests });
  const onMessageRef = useRef(onMessage);
  const onReadyRef = useRef(onReady);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    latest.current = { name, numPlayers, guests };
    onMessageRef.current = onMessage;
    onReadyRef.current = onReady;
    onLostRef.current = onLost;
  });

  useEffect(
    () => () => {
      if (!started.current) {
        opened.current.forEach((connection) => connection.close());
      }
    },
    [],
  );

  function tidy(raw: string): string {
    return raw.trim().slice(0, MAX_NAME) || "Me";
  }

  // For the callbacks, which run long after the render that made them.
  function trimmedName(): string {
    return tidy(latest.current.name);
  }

  // For the markup, which has the state itself to hand.
  const myName = tidy(name);

  function remember() {
    try {
      localStorage.setItem(STORE, name.trim());
    } catch {
      // Not remembered next time; harmless.
    }
  }

  // ---------------------------------------------------------------- hosting

  async function invite() {
    setBusy(true);
    setError(null);
    remember();
    // The seat this guest will take: the host has the first, so guests fill
    // the ones after it in the order they join.
    const seat = latest.current.guests.length + 1;
    try {
      const pairing = await createHost({
        onOpen: () => {},
        onClose: () => {
          if (started.current) {
            onLostRef.current(seat);
            return;
          }
          setGuests((current) => current.filter((g) => g.seat !== seat));
          setError("That player dropped off before the game started.");
        },
        onMessage: (raw) => {
          if (started.current) {
            onMessageRef.current(raw, seat);
            return;
          }
          // Before the deal, the only frame that matters is the introduction.
          const message: NetMessage | null = parseMessage(raw);
          if (message?.type !== "hello") return;
          setGuests((current) =>
            current.some((g) => g.seat === seat)
              ? current
              : [
                  ...current,
                  {
                    seat,
                    name:
                      message.name.trim().slice(0, MAX_NAME) ||
                      `Player ${seat}`,
                    connection: pairing.connection,
                  },
                ],
          );
          setStage({ kind: "lobby" });
        },
      });
      opened.current.push(pairing.connection);
      setStage({ kind: "inviting", pairing });
    } catch {
      setError("This device could not start a game. Try reloading.");
      setStage({ kind: "lobby" });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(answerCode: string, pairing: Pairing) {
    setBusy(true);
    setError(null);
    try {
      await pairing.accept?.(answerCode);
      // The guest's "hello" moves us on to the lobby; until then this is the
      // honest state of things.
      setStage({ kind: "lobby" });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That code could not be read. Try again.",
      );
      setStage({ kind: "confirming", pairing });
    } finally {
      setBusy(false);
    }
  }

  function deal() {
    if (started.current) return;
    started.current = true;
    const players = latest.current.numPlayers;
    onReadyRef.current({
      role: "host",
      myName: trimmedName(),
      numPlayers: players,
      // Two at the table is a straight match; more is a tournament.
      mode: players === 2 ? "1v1" : "elimination",
      guests: [...latest.current.guests].sort((a, b) => a.seat - b.seat),
    });
  }

  // ---------------------------------------------------------------- joining

  async function join(offerCode: string) {
    setBusy(true);
    setError(null);
    remember();
    try {
      const pairing = await createGuest(offerCode, {
        onOpen: () => {
          // Introducing ourselves is a guest's first act, and what tells the
          // host who has joined.
          pairing.connection.send({ type: "hello", name: trimmedName() });
          if (started.current) return;
          started.current = true;
          setStage({ kind: "joined" });
          onReadyRef.current({
            role: "guest",
            myName: trimmedName(),
            // A guest is dealt to, so it never needs either of these.
            numPlayers: 2,
            mode: "1v1",
            guests: [],
            host: pairing.connection,
          });
        },
        onClose: () => {
          if (started.current) {
            onLostRef.current(HOST_SEAT);
            return;
          }
          setError("Lost the connection before the game started.");
          setStage({ kind: "setup" });
        },
        onMessage: (raw) => onMessageRef.current(raw, HOST_SEAT),
      });
      opened.current.push(pairing.connection);
      setStage({ kind: "joinShowing", pairing });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That code could not be read. Try again.",
      );
      setStage({ kind: "joinScanning" });
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ views

  const frame = (children: React.ReactNode) => (
    <div
      className={SCREEN}
      style={{ backgroundImage: "url('/firstpagebackground.jpg')" }}
    >
      <div className={PANEL}>
        <h1 className="text-center text-2xl font-black tracking-tight">
          Play with friends nearby
        </h1>
        <p className="mt-1 mb-4 text-center text-sm text-emerald-200/80">
          Every phone on the same Wi-Fi or hotspot. No internet needed.
        </p>
        <div className={CARD}>
          {error && (
            <p className="mb-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
              {error}
            </p>
          )}
          {children}
        </div>
        <button type="button" onClick={onBack} className={`${GHOST} mt-3`}>
          ← Back to modes
        </button>
      </div>
    </div>
  );

  if (stage.kind === "setup") {
    return frame(
      <>
        <label className="block">
          <span className="text-sm font-semibold text-emerald-300">
            Your name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME}
            placeholder="Me"
            autoComplete="off"
            spellCheck={false}
            className={`mt-1 ${FIELD}`}
          />
        </label>

        <div className="mt-4">
          <span className="text-sm font-semibold text-emerald-300">
            Players at the table
          </span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumPlayers(n)}
                className={`rounded-xl py-2 font-black transition ${
                  numPlayers === n
                    ? "bg-emerald-600 text-white"
                    : "border border-white/20 text-emerald-200 hover:bg-white/10"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-emerald-200/70">
            Invite a phone for as many of these as you like — bots take
            whichever seats are left. Only matters if you start the game.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => {
              remember();
              setError(null);
              setStage({ kind: "lobby" });
            }}
            disabled={busy}
            className={BUTTON}
          >
            Start a game
          </button>
          <button
            type="button"
            onClick={() => {
              remember();
              setError(null);
              setStage({ kind: "joinScanning" });
            }}
            disabled={busy}
            className={GHOST}
          >
            Join a game
          </button>
        </div>
      </>,
    );
  }

  if (stage.kind === "lobby") {
    const room = numPlayers - 1 - guests.length;
    return frame(
      <>
        <h2 className="font-bold text-emerald-100">Who is at the table</h2>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center justify-between rounded-xl border border-amber-400/40 bg-emerald-700/30 px-3 py-2">
            <span className="font-bold">{myName}</span>
            <span className="text-xs font-semibold text-amber-300">you</span>
          </li>
          {guests.map((guest) => (
            <li
              key={guest.seat}
              className="flex items-center justify-between rounded-xl border border-emerald-400/40 bg-emerald-700/20 px-3 py-2"
            >
              <span className="font-bold">{guest.name}</span>
              <span className="text-xs font-semibold text-emerald-300">
                joined
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, room) }, (_, i) => (
            <li
              key={`bot-${i}`}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-emerald-200/70"
            >
              <span className="font-semibold">
                Player {guests.length + 1 + i}
              </span>
              <span className="text-xs font-semibold">bot</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-2">
          {room > 0 && (
            <button
              type="button"
              onClick={() => void invite()}
              disabled={busy}
              className={GHOST}
            >
              + Invite a phone for the next seat
            </button>
          )}
          <button type="button" onClick={deal} className={BUTTON}>
            Deal the cards →
          </button>
        </div>
      </>,
    );
  }

  if (stage.kind === "inviting") {
    return frame(
      <>
        <h2 className="font-bold text-emerald-100">
          Step 1 — let them scan this
        </h2>
        <CodeBlock value={stage.pairing.code} />
        <button
          type="button"
          onClick={() =>
            setStage({ kind: "confirming", pairing: stage.pairing })
          }
          className={`${BUTTON} mt-4`}
        >
          They have scanned it →
        </button>
      </>,
    );
  }

  if (stage.kind === "confirming") {
    return frame(
      <>
        <h2 className="font-bold text-emerald-100">
          Step 2 — scan the code they show back
        </h2>
        <div className="mt-3">
          <QrScanner onScan={(code) => void confirm(code, stage.pairing)} />
        </div>
        <CodeInput
          label="Or paste their code"
          disabled={busy}
          onSubmit={(code) => void confirm(code, stage.pairing)}
        />
      </>,
    );
  }

  if (stage.kind === "joinScanning") {
    return frame(
      <>
        <h2 className="font-bold text-emerald-100">
          Scan the code on the host&apos;s phone
        </h2>
        <div className="mt-3">
          <QrScanner onScan={(code) => void join(code)} />
        </div>
        <CodeInput
          label="Or paste their code"
          disabled={busy}
          onSubmit={(code) => void join(code)}
        />
      </>,
    );
  }

  if (stage.kind === "joinShowing") {
    return frame(
      <>
        <h2 className="font-bold text-emerald-100">
          Now let them scan this back
        </h2>
        <CodeBlock value={stage.pairing.code} />
        <p className="mt-3 text-sm text-emerald-200/80">
          You are in as soon as they do.
        </p>
      </>,
    );
  }

  return frame(
    <p className="animate-pulse text-center font-semibold text-amber-300">
      You&apos;re in — waiting for the host to deal…
    </p>,
  );
}

/** A code to be read off this screen — as a QR, and as text to copy. */
function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      {/* Sized against the viewport rather than in rem. Everything else scales
      with the root font size so the card table fits, and a QR that shrank with
      it would stop being readable by a camera — there are several hundred
      characters in this one, so its modules are already small. */}
      <div className="mt-3 rounded-xl bg-white p-2">
        <QrCode
          value={value}
          className="mx-auto h-auto w-[min(62vmin,320px)]"
        />
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
        className={`${GHOST} mt-2`}
      >
        {copied ? "Copied" : "Copy code instead"}
      </button>
    </>
  );
}

/** The way in when there is no camera: paste the code by hand. */
function CodeInput({
  label,
  disabled,
  onSubmit,
}: {
  label: string;
  disabled: boolean;
  onSubmit: (code: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <label className="text-sm font-semibold text-emerald-300">{label}</label>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        autoComplete="off"
        spellCheck={false}
        className={`mt-1 font-mono text-xs break-all ${FIELD}`}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={`${GHOST} mt-1`}
      >
        Use this code
      </button>
    </form>
  );
}
