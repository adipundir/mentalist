"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Character, type CharacterSpec } from "./Character";
import { isNarratorMuted, narrate, setNarratorMuted, stopNarration, unlockNarrator } from "@/lib/narrator";

/**
 * A narrative beat between cases.
 *
 * Text types itself at reading speed while the narrator reads it aloud, so the two land
 * together instead of the eye racing ahead of the voice. Clicking once skips to the full
 * text; clicking again continues — impatient players are never held hostage by an
 * animation, which is the single most common sin of story cards in games.
 */
export function StoryCard({
  chapter,
  title,
  body,
  speaker,
  onContinue,
  continueLabel = "CONTINUE",
}: {
  chapter?: string;
  title: string;
  body: string;
  /** Optional character portrait — used when a CBI voice is delivering the line. */
  speaker?: { name: string; role: string; spec: CharacterSpec } | null;
  onContinue: () => void;
  continueLabel?: string;
}) {
  const [shown, setShown] = useState(0);
  const [muted, setMuted] = useState(isNarratorMuted());
  const done = shown >= body.length;
  const started = useRef(false);

  // Type it out. ~28ms/char lands close to spoken pace for this register.
  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setShown((n) => Math.min(body.length, n + 1)), 28);
    return () => clearTimeout(id);
  }, [shown, done, body.length]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    unlockNarrator();
    void narrate(body);
    return () => stopNarration();
  }, [body]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/96 p-5 backdrop-blur-sm"
      onClick={() => (done ? onContinue() : setShown(body.length))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          done ? onContinue() : setShown(body.length);
        }
      }}
    >
      <motion.div
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.35 }}
        className="paper w-full max-w-[640px] border-2 border-ink-3 p-7 sm:p-9"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {chapter && (
              <p className="font-mono text-[10px] tracking-file text-blood-hot">{chapter}</p>
            )}
            <h2 className="font-type text-[30px] leading-tight text-bone sm:text-[36px]">
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const next = !muted;
              setMuted(next);
              setNarratorMuted(next);
              if (!next) void narrate(body);
            }}
            className="shrink-0 cursor-pointer border border-ink-3 px-2 py-1 font-mono text-[9px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
          >
            {muted ? "NARRATION OFF" : "NARRATION ON"}
          </button>
        </div>

        <div className="mt-5 flex gap-5">
          {speaker && (
            <div className="shrink-0">
              <div className="w-24 border-2 border-ink-3 bg-[#211c1a]">
                <Character spec={speaker.spec} expression="talking" className="h-28 w-full" />
              </div>
              <p className="mt-1 text-center font-type text-[11px] leading-tight text-bone">
                {speaker.name}
              </p>
              <p className="text-center font-body text-[10px] italic leading-tight text-bone-dim">
                {speaker.role}
              </p>
            </div>
          )}

          <p
            className={`min-h-[7rem] flex-1 font-body text-[16px] leading-relaxed text-bone ${done ? "" : "caret"}`}
          >
            {body.slice(0, shown)}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink-3 pt-4">
          <span className="font-mono text-[9px] tracking-file text-bone-dim/50">
            {done ? "CLICK ANYWHERE TO CONTINUE" : "CLICK TO SKIP"}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContinue();
            }}
            className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2 font-mono text-[10px] tracking-file text-blood-hot hover:bg-blood-hot/25"
          >
            {continueLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
