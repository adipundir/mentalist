"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { loadVoices, narrate, unlockNarrator } from "@/lib/narrator";
import * as sfx from "@/lib/sound";

/**
 * The boot sequence.
 *
 * It is not a fake progress bar. Each step does real work that has to happen before the
 * first scene anyway, waking the audio context, waiting for the browser's speech voices
 * (which populate asynchronously and would otherwise make the first narrated line silent),
 * and letting the webfonts settle so the opening card doesn't reflow mid-sentence.
 *
 * The player's click to start is also what unlocks audio: browsers refuse to play sound
 * before a gesture, so the one screen that *requires* a click is the right place to do it.
 */

/**
 * Two steps, not four.
 *
 * This screen exists to do the two things that genuinely cannot happen before a click,
 * unlocking audio and loading the voices, and to cover the font swap. It is not a progress
 * bar for work that is not happening, so it no longer pretends to be one.
 */
const STEPS = [
  {
    label: "OPENING THE FILE",
    work: async () => {
      sfx.startRoomTone();
      unlockNarrator();
      await loadVoices();
    },
  },
  {
    label: "WAKING THE WITNESSES",
    work: async () => {
      if (typeof document !== "undefined" && "fonts" in document) {
        await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
      }
    },
  },
];

export function BootScreen({ onReady }: { onReady: () => void }) {
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      for (let i = 0; i < STEPS.length; i++) {
        setStep(i);
        sfx.tick(180 + i * 40, 0.04, 0.04);
        await STEPS[i].work();
        // Just enough of a floor to read as a beat rather than a flicker. It used to be
        // 520ms across four steps, which is two seconds of watching a bar move.
        await new Promise((r) => setTimeout(r, 170));
      }
      sfx.knock(0.7);
      setDone(true);
      void narrate(
        "Seven rooms, and Red John killed in every one of them. Find the story that cannot be true.",
        { rate: 0.94 },
      );
      // Do not hold the screen for the whole line: it carries on over the board.
      setTimeout(onReady, 650);
    })();
  }, [onReady]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-ink px-6"
    >
      {/* the mark, drawn on */}
      <svg viewBox="0 0 120 120" className="h-28 w-28" aria-hidden>
        <motion.circle
          cx="60" cy="60" r="44"
          fill="none" stroke="#a81c1c" strokeWidth="7" strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        />
        <motion.path
          d="M44 48 L44 48 M76 48 L76 48"
          stroke="#a81c1c" strokeWidth="13" strokeLinecap="round"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }}
        />
        <motion.path
          d="M40 74 Q60 92 80 74"
          fill="none" stroke="#a81c1c" strokeWidth="7" strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, delay: 1.15, ease: "easeOut" }}
        />
      </svg>

      <p className="mt-6 font-mono text-[10px] tracking-file text-bone-dim">
        {done ? "READY" : (STEPS[Math.max(0, step)]?.label ?? "")}
      </p>

      <div className="mt-3 h-[2px] w-56 bg-ink-3">
        <motion.div
          className="h-full bg-blood-hot"
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </motion.div>
  );
}
