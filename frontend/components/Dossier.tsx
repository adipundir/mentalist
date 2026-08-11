"use client";


import type { Suspect } from "@/lib/suspects";

export type SeatVerdict = "live" | "cleared" | "accused" | "tyger";
export type SeatHonesty = "liar" | "honest" | "unknown";

interface Props {
  suspect: Suspect;
  /** Is this seat inside the question currently being assembled? */
  inQuestion: boolean;
  /** Is this seat the witness being asked? */
  isWitness: boolean;
  verdict: SeatVerdict;
  honesty: SeatHonesty;
  /** Share of surviving worlds in which this seat is the Tyger, 0–1. */
  odds: number;
  turned: boolean;
  disabled: boolean;
  onToggle: () => void;
  onWitness: () => void;
  index: number;
}

/**
 * A face drawn rather than loaded — no image pipeline, no asset licensing, and every
 * suspect is deterministic from their seed so a shared case looks identical to everyone.
 */
function Portrait({ suspect, muted }: { suspect: Suspect; muted: boolean }) {
  const { hue, jaw, brow, tilt } = suspect.portrait;
  return (
    <svg
      viewBox="0 0 64 72"
      className="h-full w-full"
      style={{ transform: `rotate(${tilt}deg)`, opacity: muted ? 0.28 : 1 }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`sk-${suspect.seat}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${28 + hue} 14% 42%)`} />
          <stop offset="100%" stopColor={`hsl(${28 + hue} 16% 24%)`} />
        </linearGradient>
      </defs>
      {/* shoulders */}
      <path d="M6 72 Q32 50 58 72 Z" fill={`hsl(${210 + hue} 8% 16%)`} />
      {/* head */}
      <ellipse cx="32" cy="30" rx={17 * jaw} ry="21" fill={`url(#sk-${suspect.seat})`} />
      {/* brow */}
      <rect x={20} y={26 - brow * 2} width="24" height={2.4 * brow} rx="1" fill="rgb(20 20 22 / 0.75)" />
      {/* eyes */}
      <circle cx="25" cy="31" r="1.7" fill="rgb(12 12 14)" />
      <circle cx="39" cy="31" r="1.7" fill="rgb(12 12 14)" />
      {/* mouth — a flat line, always. Nobody in this file is smiling. */}
      <rect x="26" y="41" width="12" height="1.4" rx="0.7" fill="rgb(14 14 16 / 0.8)" />
    </svg>
  );
}

export function Dossier({
  suspect,
  inQuestion,
  isWitness,
  verdict,
  honesty,
  odds,
  turned,
  disabled,
  onToggle,
  onWitness,
  index,
}: Props) {
  const cleared = verdict === "cleared";
  const isTyger = verdict === "tyger";

  return (
    // Entry is a CSS animation, not a JS one: a card whose visibility depends on
    // requestAnimationFrame can stay at opacity 0 if animation frames never tick (headless
    // capture, a stalled main thread, reduced-motion edge cases). CSS fails open.
    <div className="deal-in relative" style={{ animationDelay: `${index * 35}ms` }}>
      <div
        className={[
          "paper relative flex flex-col gap-2 border p-3 transition-colors duration-200",
          isTyger
            ? "border-blood-hot shadow-[0_0_28px_-6px_rgb(var(--blood-hot)/0.7)]"
            : inQuestion
              ? "border-blood-hot/70"
              : "border-ink-3",
          cleared ? "opacity-45" : "",
        ].join(" ")}
      >
        {/* seat number, like a filing tab */}
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] tracking-file text-bone-dim">
            SEAT {String(suspect.seat + 1).padStart(2, "0")}
          </span>
          {honesty !== "unknown" && (
            <span
              className={[
                "font-mono text-[9px] tracking-file",
                honesty === "liar" ? "text-blood-hot" : "text-brass",
              ].join(" ")}
              title={
                honesty === "liar"
                  ? "Proven to lie. Invert everything they tell you — that makes them as useful as an honest witness."
                  : "Proven honest across every layout still consistent with your testimony."
              }
            >
              {honesty === "liar" ? "LIES" : "TRUE"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={inQuestion}
          aria-label={`${inQuestion ? "Remove" : "Add"} ${suspect.name} ${inQuestion ? "from" : "to"} the question`}
          className="group relative flex cursor-pointer items-start gap-3 text-left disabled:cursor-not-allowed"
        >
          <div className="h-14 w-12 shrink-0 border border-ink-3 bg-ink">
            <Portrait suspect={suspect} muted={cleared} />
          </div>

          <div className="min-w-0 flex-1">
            <div className={`relative ${cleared ? "struck" : ""}`}>
              <p className="truncate font-type text-[13px] leading-tight text-bone">
                {suspect.name}
              </p>
            </div>
            <p className="truncate font-body text-[11px] italic leading-tight text-bone-dim">
              {suspect.role}
            </p>
            <p className="mt-1 truncate font-body text-[10px] leading-tight text-bone-dim/70">
              {suspect.tell}
            </p>
          </div>
        </button>

        {/* Odds bar — the possibility space, made physical. Width is a plain inline style
            with a CSS transition rather than a JS animation: the bar must show the true
            number on first paint, never animate up from (or sit at) a wrong one. */}
        <div
          className="h-[3px] w-full bg-ink-3"
          role="meter"
          aria-valuenow={Math.round(odds * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${suspect.name}: share of layouts in which they are the Tyger`}
          title={`${Math.round(odds * 100)}% of the layouts still consistent with your testimony`}
        >
          <div
            className={`h-full transition-[width] duration-300 ease-out ${isTyger ? "bg-blood-hot" : "bg-blood"}`}
            style={{ width: `${Math.max(0, Math.min(100, odds * 100))}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onWitness}
            disabled={disabled}
            className={[
              "flex-1 cursor-pointer border px-2 py-1.5 font-mono text-[9px] tracking-file transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              isWitness
                ? "border-blood-hot bg-blood-hot/15 text-blood-hot"
                : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
            ].join(" ")}
          >
            {isWitness ? "ASKING" : "ASK"}
          </button>
          <span
            className={[
              "min-w-[3.2rem] border border-ink-3 px-1.5 py-1.5 text-center font-mono text-[9px] tracking-file",
              inQuestion ? "bg-blood/25 text-bone" : "text-bone-dim/60",
            ].join(" ")}
          >
            {inQuestion ? "IN" : "OUT"}
          </span>
        </div>

        {turned && (
          <div className="absolute -right-1 -top-2 rotate-6 border border-blood-hot bg-ink px-1 py-0.5 font-mono text-[8px] tracking-file text-blood-hot">
            TURNED
          </div>
        )}

        {isTyger && (
          <div className="stamp pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="border-[3px] border-blood-hot px-2 py-1 font-type text-[15px] tracking-file text-blood-hot">
              THE TYGER
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
