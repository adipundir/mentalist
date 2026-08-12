"use client";

import { motion } from "framer-motion";
import { classifyQuestion, maskSeats, type Testimony } from "@/lib/case";
import type { Suspect } from "@/lib/suspects";
import { Character } from "./Character";

const KIND: Record<string, string> = { control: "CONTROL", self: "SELF", split: "SPLIT" };

/**
 * Jane's notebook, the deduction grid, pulled up over the scene.
 *
 * It used to live permanently in a sidebar, which meant the suspects were competing with a
 * spreadsheet for the player's eye. As a drawer it does the same work without ever taking
 * the room off screen.
 *
 * It does the bookkeeping so the player spends their thinking on *which question to ask*.
 * Everything in here is derived only from answers the player legitimately holds.
 */
export function Notebook({
  suspects,
  testimony,
  honesty,
  odds,
  turned,
  onClose,
}: {
  suspects: Suspect[];
  testimony: Testimony[];
  honesty: ("liar" | "honest" | "unknown")[];
  odds: number[];
  turned: number[];
  onClose: () => void;
}) {
  const n = suspects.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm sm:p-8"
    >
      <motion.div
        initial={{ y: 30, rotate: -0.6 }}
        animate={{ y: 0, rotate: -0.4 }}
        exit={{ y: 30 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="paper max-h-full w-full max-w-[900px] overflow-y-auto border-2 border-ink-3 p-5 sm:p-7"
      >
        <header className="flex items-baseline justify-between border-b border-ink-3 pb-3">
          <h2 className="font-type text-[22px] text-bone">What I know so far</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-ink-3 px-3 py-1 font-mono text-[10px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
          >
            CLOSE
          </button>
        </header>

        {/* the list, with the possibility space made physical */}
        <section className="mt-4">
          <h3 className="font-mono text-[10px] tracking-file text-bone-dim">THE SUSPECTS</h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {suspects.map((s, i) => {
              const out = odds[i] === 0;
              return (
                <li
                  key={s.seat}
                  className={`flex items-center gap-2 border border-ink-3 px-2 py-1.5 ${out ? "opacity-40" : ""}`}
                >
                  <div className="h-9 w-8 shrink-0 border border-ink-3 bg-[#211c1a]">
                    <Character spec={s.character} expression="neutral" cleared={out} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`relative truncate font-type text-[12px] text-bone ${out ? "struck" : ""}`}>
                      {s.name}
                    </p>
                    <div className="mt-0.5 h-[3px] w-full bg-ink-3">
                      <div className="h-full bg-blood" style={{ width: `${odds[i] * 100}%` }} />
                    </div>
                  </div>
                  {honesty[i] !== "unknown" && (
                    <span
                      className={`shrink-0 border px-1 font-mono text-[8px] tracking-file ${
                        honesty[i] === "liar"
                          ? "border-blood-hot text-blood-hot"
                          : "border-brass text-brass"
                      }`}
                    >
                      {honesty[i] === "liar" ? "LIAR" : "TRUE"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* the transcript */}
        <section className="mt-5">
          <h3 className="font-mono text-[10px] tracking-file text-bone-dim">
EVERYTHING THEY'VE TOLD ME · {testimony.length}
          </h3>
          {testimony.length === 0 ? (
            <p className="py-4 font-body text-[13px] italic text-bone-dim/70">
              Nothing yet. Ask someone about someone else.
            </p>
          ) : (
            <ol className="mt-1 divide-y divide-ink-3">
              {testimony.map((t) => {
                const kind = classifyQuestion(t.mask, t.witness, n);
                const state = honesty[t.witness];
                const stale = turned.includes(t.witness);
                const usable = state !== "unknown" && !stale;
                const effective = state === "liar" ? !t.answer : t.answer;

                return (
                  <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-2">
                    <span className="pt-0.5 font-mono text-[10px] text-bone-dim/75">
                      {String(t.id + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-type text-[12px] text-bone">
                          {suspects[t.witness].name}
                        </span>
                        <span
                          className={`font-mono text-[8px] tracking-file ${kind === "control" ? "text-brass" : "text-bone-dim/75"}`}
                        >
                          {kind === "control" ? "HONESTY TEST" : kind === "self" ? "ABOUT HIMSELF" : ""}
                        </span>
                        {stale && (
                          <span className="font-mono text-[8px] tracking-file text-blood-hot">
  CHANGED HIS STORY SINCE
                          </span>
                        )}
                      </div>
                      <p className="font-body text-[12px] leading-snug text-bone-dim">
                        {kind === "control" ? (
                          <>&ldquo;Is he even in this room?&rdquo;</>
                        ) : (
                          <>
                            &ldquo;Is it{" "}
                            <span className="text-bone">
                              {maskSeats(t.mask, n).map((x) => suspects[x].name).join(", ")}
                            </span>
                            ?&rdquo;
                          </>
                        )}
                      </p>
                      {usable && (
                        <p className="mt-0.5 font-mono text-[9px] tracking-file text-brass/80">
                          {state === "liar" ? "HE LIES, SO REALLY: " : "HE'S HONEST, SO: "}
                          {effective ? "YES" : "NO"}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 border px-1.5 py-0.5 font-type text-[11px] tracking-file ${
                        t.answer ? "border-blood-hot/60 text-blood-hot" : "border-bone-dim/40 text-bone-dim"
                      }`}
                    >
                      {t.answer ? "YES" : "NO"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </motion.div>
    </motion.div>
  );
}
