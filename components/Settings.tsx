"use client";

import type { Difficulty } from "@/lib/types";
import type { Settings } from "@/lib/settings";
import { DIFFICULTY_BLURB } from "@/lib/settings";

interface SettingsScreenProps {
  settings: Settings;
  /** Applied and saved as soon as anything is touched — there is no OK button. */
  onChange: (settings: Settings) => void;
  onBack: () => void;
}

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const SEATS = [2, 3, 4];

const SCREEN =
  "flex h-full flex-col overflow-y-auto bg-cover bg-center text-white";
const PANEL = "m-auto flex w-full max-w-md flex-col p-4";
const GROUP = "mt-5 rounded-2xl border border-white/10 bg-black/60 p-4";
const LEGEND = "text-sm font-bold text-emerald-300";

/** A row of mutually exclusive choices. */
function Choice<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div
      className="mt-2 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onPick(option.value)}
          aria-pressed={option.value === value}
          className={`rounded-xl py-2 font-black transition ${
            option.value === value
              ? "bg-emerald-600 text-white"
              : "border border-white/20 text-emerald-200 hover:bg-white/10"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsScreen({
  settings,
  onChange,
  onBack,
}: SettingsScreenProps) {
  return (
    <div
      className={SCREEN}
      style={{ backgroundImage: "url('/firstpagebackground.jpg')" }}
    >
      <div className={PANEL}>
        <h1 className="text-center text-2xl font-black tracking-tight">
          ⚙️ Settings
        </h1>
        <p className="mt-1 text-center text-sm text-emerald-200/80">
          Kept between games on this phone.
        </p>

        <div className={GROUP}>
          <span className={LEGEND}>Difficulty</span>
          <Choice
            options={LEVELS}
            value={settings.difficulty}
            onPick={(difficulty) => onChange({ ...settings, difficulty })}
          />
          <p className="mt-2 text-xs text-emerald-200/80">
            {DIFFICULTY_BLURB[settings.difficulty]}
          </p>
        </div>

        <div className={GROUP}>
          <span className={LEGEND}>Sound effects</span>
          <Choice
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            value={settings.sound ? "on" : "off"}
            onPick={(choice) =>
              onChange({ ...settings, sound: choice === "on" })
            }
          />
          <p className="mt-2 text-xs text-emerald-200/80">
            Dealing, playing and drawing cards, and the win and lose fanfares.
          </p>
        </div>

        <div className={GROUP}>
          <span className={LEGEND}>Players</span>
          <Choice
            options={SEATS.map((n) => ({ value: n, label: String(n) }))}
            value={settings.numPlayers}
            onPick={(numPlayers) => onChange({ ...settings, numPlayers })}
          />
          <p className="mt-2 text-xs text-emerald-200/80">
            How many seats an elimination game starts with. You can still
            change it when you start one.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mt-5 w-full rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
        >
          Done
        </button>
      </div>
    </div>
  );
}
