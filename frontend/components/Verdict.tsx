"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { CaseConfig } from "@/lib/case";
import { caseNumber, caseTitle, type Suspect } from "@/lib/suspects";

interface Props {
  solved: boolean;
  suspects: Suspect[];
  truth: { killer: number; liars: boolean[] };
  accused: number | null;
  focusLeft: number;
  questions: number;
  seed: number;
  config: CaseConfig;
  onNewCase?: () => void;
}

/**
 * The post-mortem. Everything opens at once because the case is over — this is the reveal
 * the whole game has been withholding, and staging it is the single highest-value piece of
 * animation in the app.
 */
export function Verdict({
  solved,
  suspects,
  truth,
  accused,
  focusLeft,
  questions,
  seed,
  config,
  onNewCase,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [row, setRow] = useState(0);

  // Meter the reveal: rows land 140ms apart rather than all in one frame. Roughly a second
  // of the most satisfying moment in the genre, out of data we already had.
  useEffect(() => {
    if (row >= suspects.length) return;
    const t = setTimeout(() => setRow((r) => r + 1), 140);
    return () => clearTimeout(t);
  }, [row, suspects.length]);

  const share = buildShare({ solved, focusLeft, questions, seed, config, truth, suspects });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/92 p-4 backdrop-blur-sm sm:p-8"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        className="paper my-auto w-full max-w-[680px] border border-ink-3 p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-file text-bone-dim">
              CASE {caseNumber(seed)} · {caseTitle(seed)}
            </p>
            <h2
              className={`font-type text-[34px] leading-tight ${solved ? "text-bone" : "text-bone-dim"}`}
            >
              {solved ? "CASE CLOSED" : "HE WALKED"}
            </h2>
          </div>
          <div
            className={`stamp shrink-0 border-[3px] px-3 py-1.5 font-type text-[15px] tracking-file ${
              solved ? "border-brass text-brass" : "border-blood-hot text-blood-hot"
            }`}
          >
            {solved ? "SOLVED" : "COLD"}
          </div>
        </div>

        <p className="mt-3 font-body text-[14px] leading-relaxed text-bone-dim">
          {solved ? (
            <>
              You named <span className="text-bone">{suspects[truth.killer].name}</span> and you
              were right — with{" "}
              <span className="text-blood-hot">{focusLeft} Focus</span> still in hand after{" "}
              {questions} read{questions === 1 ? "" : "s"}.
            </>
          ) : (
            <>
              You named{" "}
              <span className="text-bone">
                {accused !== null ? suspects[accused].name : "nobody"}
              </span>
              . It was{" "}
              <span className="text-blood-hot">{suspects[truth.killer].name}</span> — the{" "}
              {suspects[truth.killer].role}.
            </>
          )}
        </p>

        {/* the full board, opened */}
        <div className="mt-5 border-t border-ink-3 pt-4">
          <h3 className="mb-2 font-mono text-[10px] tracking-file text-bone-dim">
            WHO WAS TELLING YOU THE TRUTH
          </h3>
          <ul className="divide-y divide-ink-3">
            {suspects.map((s, i) => {
              if (i >= row) return null;
              const isKiller = i === truth.killer;
              const lies = truth.liars[i];
              return (
                <motion.li
                  key={s.seat}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-baseline justify-between gap-3 py-1.5"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="font-mono text-[10px] text-bone-dim/50">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`truncate font-type text-[13px] ${isKiller ? "text-blood-hot" : "text-bone"}`}
                    >
                      {s.name}
                    </span>
                    {i === accused && (
                      <span className="font-mono text-[8px] tracking-file text-brass">
                        YOU NAMED
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-mono text-[9px] tracking-file ${lies ? "text-blood-hot" : "text-bone-dim"}`}
                    >
                      {lies ? "LIED TO YOU" : "TOLD THE TRUTH"}
                    </span>
                    {isKiller && (
                      <span className="border border-blood-hot px-1 font-mono text-[8px] tracking-file text-blood-hot">
                        THE TYGER
                      </span>
                    )}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(share);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            className="cursor-pointer border border-ink-3 px-4 py-2 font-mono text-[10px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
          >
            {copied ? "COPIED" : "COPY THE FILE"}
          </button>
          {onNewCase && (
            <button
              type="button"
              onClick={onNewCase}
              className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2 font-mono text-[10px] tracking-file text-blood-hot hover:bg-blood-hot/25"
            >
              NEXT CASE
            </button>
          )}
        </div>

        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border border-ink-3 bg-ink p-3 font-mono text-[11px] leading-relaxed text-bone-dim">
          {share}
        </pre>
      </motion.div>
    </motion.div>
  );
}

/**
 * Spoiler-free share text. Shows *how* you worked, never who did it — so posting it can't
 * burn the case for the next person.
 */
function buildShare({
  solved,
  focusLeft,
  questions,
  seed,
  config,
  truth,
  suspects,
}: {
  solved: boolean;
  focusLeft: number;
  questions: number;
  seed: number;
  config: CaseConfig;
  truth: { killer: number; liars: boolean[] };
  suspects: Suspect[];
}) {
  const spent = config.focus - focusLeft;
  const grid =
    "▮".repeat(spent) + "▯".repeat(Math.max(0, focusLeft));

  const liarsFound = truth.liars.filter(Boolean).length;

  return [
    `MENTALIST · case ${caseNumber(seed)} — ${caseTitle(seed)}`,
    `${config.label} · ${suspects.length} suspects · ${liarsFound} of them lying`,
    ``,
    `${grid}  ${solved ? `closed in ${questions} read${questions === 1 ? "" : "s"}` : "he walked"}`,
    ``,
    solved
      ? `${focusLeft} Focus left over — that's ${focusLeft} Megapot ticket${focusLeft === 1 ? "" : "s"}.`
      : `Everyone lies. The Tyger always does.`,
  ].join("\n");
}
