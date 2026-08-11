"use client";

import { motion, AnimatePresence } from "framer-motion";
import { classifyQuestion, maskSeats, type Testimony } from "@/lib/case";
import type { Suspect } from "@/lib/suspects";

const KIND_LABEL: Record<string, string> = {
  control: "CONTROL",
  self: "SELF",
  split: "SPLIT",
};

/**
 * The transcript is the detective's notebook, and it is the reason the game is playable in
 * three minutes: nothing here has to be held in the player's head. Every question, every
 * answer, and — crucially — whether that witness has since been proven to lie.
 */
export function Transcript({
  testimony,
  suspects,
  honesty,
  turned,
}: {
  testimony: Testimony[];
  suspects: Suspect[];
  honesty: ("liar" | "honest" | "unknown")[];
  turned: number[];
}) {
  const n = suspects.length;

  return (
    <div className="flex flex-col">
      <header className="flex items-baseline justify-between border-b border-ink-3 pb-2">
        <h2 className="font-mono text-[10px] tracking-file text-bone-dim">TRANSCRIPT</h2>
        <span className="font-mono text-[10px] tracking-file text-bone-dim/60">
          {testimony.length} ON RECORD
        </span>
      </header>

      {testimony.length === 0 ? (
        <p className="py-6 font-body text-[13px] italic leading-relaxed text-bone-dim/70">
          Nothing on record yet. Pick a witness, mark who the question covers, and put it to
          them.
          <br />
          <span className="text-bone-dim/50">
            Everyone in this room might be lying to you. Red John certainly is.
          </span>
        </p>
      ) : (
        <ol className="divide-y divide-ink-3">
          <AnimatePresence initial={false}>
            {testimony.map((t) => {
              const kind = classifyQuestion(t.mask, t.witness, n);
              const witness = suspects[t.witness];
              const wasTurned = turned.includes(t.witness);
              const state = honesty[t.witness];

              // A known liar is a perfect instrument — you just read them backwards.
              const trustworthy = state !== "unknown" && !wasTurned;
              const effective = state === "liar" ? !t.answer : t.answer;

              return (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-2.5"
                >
                  <span className="pt-0.5 font-mono text-[10px] text-bone-dim/50">
                    {String(t.id + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-type text-[12px] text-bone">{witness.name}</span>
                      <span
                        className={[
                          "font-mono text-[8px] tracking-file",
                          kind === "control" ? "text-brass" : "text-bone-dim/50",
                        ].join(" ")}
                      >
                        {KIND_LABEL[kind]}
                      </span>
                      {wasTurned && (
                        <span className="font-mono text-[8px] tracking-file text-blood-hot">
                          UNRELIABLE
                        </span>
                      )}
                    </div>

                    <p className="font-body text-[12px] leading-snug text-bone-dim">
                      &ldquo;Is Red John one of{" "}
                      {kind === "control" ? (
                        <span className="text-brass">all {n}</span>
                      ) : kind === "self" ? (
                        <span className="text-bone">you</span>
                      ) : (
                        <span className="text-bone">
                          {maskSeats(t.mask, n)
                            .map((s) => s + 1)
                            .join(", ")}
                        </span>
                      )}
                      ?&rdquo;
                    </p>

                    {trustworthy && (
                      <p className="mt-0.5 font-mono text-[9px] tracking-file text-brass/80">
                        {state === "liar" ? "INVERTED → " : "TAKEN AS → "}
                        {effective ? "IN THAT SET" : "NOT IN THAT SET"}
                      </p>
                    )}
                  </div>

                  <span
                    className={[
                      "shrink-0 border px-1.5 py-0.5 font-type text-[11px] tracking-file",
                      t.answer
                        ? "border-blood-hot/60 text-blood-hot"
                        : "border-bone-dim/40 text-bone-dim",
                    ].join(" ")}
                  >
                    {t.answer ? "YES" : "NO"}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
