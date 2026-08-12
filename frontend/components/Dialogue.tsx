"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Character, type CharacterSpec } from "./Character";

export interface Line {
  /** Who is talking. Null for narration. */
  speaker?: { name: string; role?: string; spec: CharacterSpec } | null;
  text: string;
  /** The mechanical answer, when this line is testimony. */
  answer?: boolean | null;
  tone?: "normal" | "jane" | "narrator";
}

/**
 * The dialogue bar.
 *
 * Visual-novel furniture: portrait on the left, nameplate, text that types itself. It sits
 * across the bottom of the scene so the room stays visible above it, the character you are
 * talking to should still be on screen, reacting, while they speak.
 *
 * The YES/NO chip is deliberately separate from the prose. The line is performance; the chip
 * is the bit the game actually runs on, and a player should never have to interpret one to
 * get the other.
 */
export function Dialogue({ line, onDone }: { line: Line | null; onDone?: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
  }, [line?.text]);

  useEffect(() => {
    if (!line) return;
    if (shown >= line.text.length) {
      onDone?.();
      return;
    }
    const id = setTimeout(() => setShown((n) => n + 1), 22);
    return () => clearTimeout(id);
  }, [shown, line, onDone]);

  return (
    <AnimatePresence>
      {line && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] p-3 sm:p-5"
          onClick={() => line && setShown(line.text.length)}
        >
          <div className="mx-auto flex max-w-[900px] items-stretch gap-0 border-2 border-ink-3 bg-ink/95 backdrop-blur">
            {line.speaker && (
              <div className="w-20 shrink-0 self-end border-r-2 border-ink-3 bg-[#1b1719] sm:w-24">
                <Character
                  spec={line.speaker.spec}
                  expression={shown < line.text.length ? "talking" : "neutral"}
                  className="h-24 w-full sm:h-28"
                />
              </div>
            )}

            <div className="min-w-0 flex-1 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={[
                    "font-mono text-[10px] tracking-file",
                    line.tone === "jane"
                      ? "text-brass"
                      : line.tone === "narrator"
                        ? "text-bone-dim/75"
                        : "text-blood-hot",
                  ].join(" ")}
                >
                  {line.speaker ? line.speaker.name.toUpperCase() : ",, "}
                  {line.speaker?.role && (
                    <span className="ml-2 text-bone-dim/75">{line.speaker.role}</span>
                  )}
                </span>

                {line.answer != null && shown >= line.text.length && (
                  <motion.span
                    initial={{ scale: 1.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className={[
                      "shrink-0 border-2 px-2 py-0.5 font-type text-[13px] tracking-file",
                      line.answer
                        ? "border-blood-hot text-blood-hot"
                        : "border-bone-dim text-bone-dim",
                    ].join(" ")}
                  >
                    {line.answer ? "YES" : "NO"}
                  </motion.span>
                )}
              </div>

              <p
                className={[
                  "mt-1 font-body text-[15px] leading-snug sm:text-[17px]",
                  line.tone === "narrator" ? "italic text-bone-dim" : "text-bone",
                  shown < line.text.length ? "caret" : "",
                ].join(" ")}
              >
                {line.text.slice(0, shown)}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
