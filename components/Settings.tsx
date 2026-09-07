"use client";

import { useState } from "react";
import type { Difficulty } from "@/lib/types";
import type { Settings } from "@/lib/settings";
import { DIFFICULTY_BLURB, RULE_LABELS } from "@/lib/settings";

interface SettingsModalProps {
  settings: Settings;
  /** Applied and saved as soon as anything is touched — there is no OK button. */
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

type Section = "difficulty" | "sound" | "players" | "rules";

const SECTIONS: { key: Section; icon: string; label: string }[] = [
  { key: "difficulty", icon: "🎯", label: "Difficulty" },
  { key: "sound", icon: "🔊", label: "Sound effects" },
  { key: "players", icon: "👥", label: "Players" },
  { key: "rules", icon: "📜", label: "Game rules" },
];

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const SEATS = [2, 3, 4];

const ROW =
  "flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10";
const BLURB = "mt-2 text-xs text-emerald-200/80";

/** What each item reads on the menu, so its setting is visible without opening it. */
function summary(section: Section, settings: Settings): string {
  switch (section) {
    case "difficulty":
      return LEVELS.find((l) => l.value === settings.difficulty)?.label ?? "";
    case "sound":
      return settings.sound ? "On" : "Off";
    case "players":
      return `${settings.numPlayers} at the table`;
    case "rules": {
      const on = RULE_LABELS.filter((rule) => settings.rules[rule.key]).length;
      return `${on} of ${RULE_LABELS.length} on`;
    }
  }
}

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
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
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

/** One rule, switched on or off. */
function RuleCheck({
  label,
  blurb,
  on,
  onToggle,
}: {
  label: string;
  blurb: string;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <label className={`${ROW} cursor-pointer items-start`}>
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onToggle(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500"
      />
      <span className="min-w-0">
        <span className="block font-bold">{label}</span>
        <span className="block text-xs text-emerald-200/80">{blurb}</span>
      </span>
    </label>
  );
}

export default function SettingsModal({
  settings,
  onChange,
  onClose,
}: SettingsModalProps) {
  // null is the menu itself; anything else is that item opened.
  const [section, setSection] = useState<Section | null>(null);
  const open = SECTIONS.find((s) => s.key === section);

  const body = () => {
    switch (section) {
      case "difficulty":
        return (
          <>
            <Choice
              options={LEVELS}
              value={settings.difficulty}
              onPick={(difficulty) => onChange({ ...settings, difficulty })}
            />
            <p className={BLURB}>{DIFFICULTY_BLURB[settings.difficulty]}</p>
          </>
        );
      case "sound":
        return (
          <>
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
            <p className={BLURB}>
              Dealing, playing and drawing cards, the spoken calls, and the win
              and lose fanfares.
            </p>
          </>
        );
      case "players":
        return (
          <>
            <Choice
              options={SEATS.map((n) => ({ value: n, label: String(n) }))}
              value={settings.numPlayers}
              onPick={(numPlayers) => onChange({ ...settings, numPlayers })}
            />
            <p className={BLURB}>
              How many seats an elimination game starts with. You can still
              change it when you start one.
            </p>
          </>
        );
      case "rules":
        return (
          <>
            <p className="mb-3 text-xs text-emerald-200/80">
              Whot is played a little differently everywhere. Switching one off
              leaves its card in the deck — it just stops carrying the rule.
              Takes effect on the next game you start.
            </p>
            <div className="space-y-2">
              {RULE_LABELS.map(({ key, label, blurb }) => (
                <RuleCheck
                  key={key}
                  label={label}
                  blurb={blurb}
                  on={settings.rules[key]}
                  onToggle={(on) =>
                    onChange({
                      ...settings,
                      rules: { ...settings.rules, [key]: on },
                    })
                  }
                />
              ))}
            </div>
          </>
        );
      default:
        return (
          <div className="space-y-2">
            {SECTIONS.map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                className={ROW}
              >
                <span aria-hidden className="text-xl">
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{label}</span>
                  <span className="block text-xs text-emerald-200/80">
                    {summary(key, settings)}
                  </span>
                </span>
                <span aria-hidden className="text-emerald-300">
                  ›
                </span>
              </button>
            ))}
          </div>
        );
    }
  };

  return (
    // Clicking the backdrop closes; the panel stops the click going through so
    // that reaching for a checkbox never dismisses the whole thing.
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-emerald-950 p-5 text-white shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-2">
          {open ? (
            <button
              type="button"
              onClick={() => setSection(null)}
              className="rounded-lg border border-white/20 px-2 py-1 text-sm font-semibold transition hover:bg-white/10"
            >
              ←
            </button>
          ) : (
            <span aria-hidden className="text-xl">
              ⚙️
            </span>
          )}
          <h2 className="flex-1 text-lg font-black tracking-tight">
            {open ? open.label : "Settings"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg border border-white/20 px-2 py-1 text-sm font-semibold transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {body()}

        {!open && (
          <p className="mt-4 text-center text-xs text-emerald-200/70">
            Kept between games on this phone.
          </p>
        )}
      </div>
    </div>
  );
}
