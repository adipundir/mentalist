"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Character } from "./Character";
import { person } from "@/lib/canon";
import { narrate, stopNarration, unlockNarrator } from "@/lib/narrator";

type Beat = { kind: "action" | "jane" | "redjohn"; text: string };

/**
 * The blink code.
 *
 * Beats land one at a time, narrated, at the pace of someone reading them aloud rather than
 * a wall of text dumped at once. Jane and McAllister get different voices — pitch and rate
 * are the only handles `speechSynthesis` gives you, and they're enough.
 */
export function Finale({ beats }: { beats: Beat[] }) {
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const jane = person("jane");
  const rj = person("mcallister");

  useEffect(() => {
    unlockNarrator();
    let cancelled = false;

    (async () => {
      for (let i = 0; i < beats.length; i++) {
        if (cancelled) return;
        setShown(i + 1);
        const b = beats[i];
        await narrate(
          b.text,
          b.kind === "jane"
            ? { rate: 0.96, pitch: 1.02 }
            : b.kind === "redjohn"
              ? { rate: 0.88, pitch: 0.9 }
              : { rate: 0.93, pitch: 0.96 },
        );
        await new Promise((r) => setTimeout(r, 320));
      }
      if (!cancelled) setDone(true);
    })();

    return () => {
      cancelled = true;
      stopNarration();
    };
  }, [beats]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[90] overflow-y-auto bg-ink p-5 sm:p-10"
    >
      <div className="mx-auto max-w-[760px]">
        <header className="mb-8 flex items-end justify-between gap-6 border-b border-ink-3 pb-5">
          <div>
            <p className="font-mono text-[10px] tracking-file text-blood-hot">CHAPTER VII — SANGUINE</p>
            <h1 className="font-type text-[38px] leading-tight text-bone sm:text-[52px]">
              The Blink Code
            </h1>
          </div>
          <div className="flex shrink-0 gap-3">
            <figure className="w-20">
              <div className="border-2 border-ink-3 bg-[#211c1a]">
                <Character spec={{ ...jane.character, id: "jane" }} expression="neutral" className="h-24 w-full" />
              </div>
              <figcaption className="mt-1 text-center font-mono text-[8px] tracking-file text-bone-dim">
                JANE
              </figcaption>
            </figure>
            <figure className="w-20">
              <div className="border-2 border-blood-hot bg-[#211c1a]">
                <Character spec={{ ...rj.character, id: "rj" }} expression="sinister" className="h-24 w-full" />
              </div>
              <figcaption className="mt-1 text-center font-mono text-[8px] tracking-file text-blood-hot">
                RED JOHN
              </figcaption>
            </figure>
          </div>
        </header>

        <ol className="space-y-4">
          {beats.slice(0, shown).map((b, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className={
                b.kind === "action"
                  ? "border-l-2 border-ink-3 pl-4 font-body text-[15px] italic leading-relaxed text-bone-dim"
                  : b.kind === "jane"
                    ? "border-l-2 border-brass pl-4"
                    : "border-l-2 border-blood-hot pl-4"
              }
            >
              {b.kind !== "action" && (
                <p
                  className={`font-mono text-[9px] tracking-file ${b.kind === "jane" ? "text-brass" : "text-blood-hot"}`}
                >
                  {b.kind === "jane" ? "JANE" : "McALLISTER"}
                </p>
              )}
              <p
                className={
                  b.kind === "action"
                    ? ""
                    : `font-type text-[17px] leading-snug ${b.kind === "jane" ? "text-bone" : "text-blood-hot"}`
                }
              >
                {b.kind === "action" ? b.text : `“${b.text}”`}
              </p>
            </motion.li>
          ))}
        </ol>

        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-10 border-t border-ink-3 pt-6"
          >
            <p className="font-body text-[15px] italic leading-relaxed text-bone-dim">
              Two thousand one hundred and sixty-four names. Ten years. One question he
              couldn&rsquo;t lie his way out of.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/case/play"
                className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2 font-mono text-[10px] tracking-file text-blood-hot hover:bg-blood-hot/25"
              >
                PLAY ON-CHAIN
              </Link>
              <Link
                href="/"
                className="cursor-pointer border border-ink-3 px-5 py-2 font-mono text-[10px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
              >
                CLOSE THE FILE
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
