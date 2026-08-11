"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Character, type Expression } from "./Character";
import type { Suspect } from "@/lib/suspects";

export type SeatVerdict = "live" | "cleared" | "accused" | "guilty";
export type SeatHonesty = "liar" | "honest" | "unknown";

interface Props {
  suspect: Suspect;
  inQuestion: boolean;
  isWitness: boolean;
  verdict: SeatVerdict;
  honesty: SeatHonesty;
  odds: number;
  turned: boolean;
  disabled: boolean;
  /** Line they're saying right now, if any — drives the speech bubble and the mouth. */
  saying?: { line: string; answer: boolean } | null;
  /** True while the question is in flight and this is the witness being asked. */
  thinking?: boolean;
  onToggle: () => void;
  onWitness: () => void;
  index: number;
}

/**
 * Work out what a suspect's face should be doing.
 *
 * The rule that matters: a suspect never *looks* guilty before the game says so. Expression
 * follows information the player already has — a proven liar sweats, an unmasked Red John
 * smiles — so the art never leaks the answer.
 */
function expressionFor({
  verdict,
  honesty,
  isWitness,
  saying,
  thinking,
  index,
}: Pick<Props, "verdict" | "honesty" | "isWitness" | "saying" | "thinking" | "index">): Expression {
  if (verdict === "guilty") return "sinister";
  if (saying) return "talking";
  if (thinking && isWitness) return "shifty";
  if (honesty === "liar") return "caught";
  if (isWitness) return "nervous";
  if (verdict === "cleared") return "neutral";
  // A little idle personality so a still board isn't nine blank stares.
  return index % 3 === 0 ? "smug" : "neutral";
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
  saying,
  thinking,
  onToggle,
  onWitness,
  index,
}: Props) {
  const cleared = verdict === "cleared";
  const guilty = verdict === "guilty";
  const expression = expressionFor({ verdict, honesty, isWitness, saying, thinking, index });

  return (
    // A speaking card lifts above its neighbours, or the next row paints over its bubble.
    <div
      className="deal-in relative"
      style={{ animationDelay: `${index * 45}ms`, zIndex: saying ? 40 : undefined }}
    >
      {/* speech bubble — the interaction the board is built around */}
      <AnimatePresence>
        {saying && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="absolute -top-2 left-1/2 z-40 w-[96%] -translate-x-1/2 -translate-y-full"
          >
            <div
              className={[
                "relative border-[2.5px] bg-[#f4ecd8] px-2.5 py-1.5 text-center",
                saying.answer ? "border-[#a81c1c]" : "border-[#1c1613]",
              ].join(" ")}
              style={{ borderRadius: 14, boxShadow: "3px 3px 0 rgb(0 0 0 / 0.45)" }}
            >
              <p className="font-type text-[11px] leading-tight text-[#1c1613]">
                &ldquo;{saying.line}&rdquo;
              </p>
              <span
                className={`font-mono text-[9px] tracking-file ${saying.answer ? "text-[#a81c1c]" : "text-[#4a423a]"}`}
              >
                {saying.answer ? "YES" : "NO"}
              </span>
              {/* bubble tail — points back at whoever is talking */}
              <span
                className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2"
                style={{
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: `10px solid ${saying.answer ? "#a81c1c" : "#1c1613"}`,
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={
          isWitness && !cleared
            ? { y: -6, scale: 1.03 }
            : guilty
              ? { scale: 1.04 }
              : { y: 0, scale: 1 }
        }
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className={[
          "paper relative flex flex-col gap-1.5 border-2 p-2.5 transition-colors duration-200",
          guilty
            ? "border-blood-hot shadow-[0_0_34px_-6px_rgb(var(--blood-hot)/0.85)]"
            : isWitness
              ? "border-brass"
              : inQuestion
                ? "border-blood-hot/70"
                : "border-ink-3",
          cleared ? "opacity-55" : "",
        ].join(" ")}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[9px] tracking-file text-bone-dim">
            {String(suspect.seat + 1).padStart(2, "0")}
          </span>
          {honesty !== "unknown" && (
            <span
              className={[
                "border px-1 font-mono text-[8px] tracking-file",
                honesty === "liar"
                  ? "border-blood-hot text-blood-hot"
                  : "border-brass text-brass",
              ].join(" ")}
              title={
                honesty === "liar"
                  ? "Proven to lie. Invert everything they tell you — that makes them as useful as an honest witness."
                  : "Proven honest across every layout still consistent with your testimony."
              }
            >
              {honesty === "liar" ? "LIAR" : "HONEST"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={inQuestion}
          aria-label={`${inQuestion ? "Remove" : "Add"} ${suspect.name} ${inQuestion ? "from" : "to"} the question`}
          className="group cursor-pointer disabled:cursor-not-allowed"
        >
          <div
            className={[
              "relative mx-auto w-full overflow-hidden border-2 transition-colors",
              inQuestion ? "border-blood-hot bg-[#2a2320]" : "border-ink-3 bg-[#211c1a]",
            ].join(" ")}
          >
            <Character
              spec={suspect.character}
              expression={expression}
              cleared={cleared && !saying}
              className="h-28 w-full"
            />
            {inQuestion && (
              <span className="absolute right-1 top-1 border border-blood-hot bg-blood-hot/20 px-1 font-mono text-[8px] tracking-file text-blood-hot">
                IN
              </span>
            )}
          </div>

          <p className={`relative mt-1.5 truncate font-type text-[12px] leading-tight text-bone ${cleared ? "struck" : ""}`}>
            {suspect.name}
          </p>
          <p className="truncate font-body text-[10px] italic leading-tight text-bone-dim">
            {suspect.role}
          </p>
        </button>

        {/* possibility bar */}
        <div
          className="h-[3px] w-full bg-ink-3"
          role="meter"
          aria-valuenow={Math.round(odds * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${suspect.name}: share of layouts in which they are Red John`}
          title={`${Math.round(odds * 100)}% of the layouts still consistent with your testimony`}
        >
          <div
            className={`h-full transition-[width] duration-300 ease-out ${guilty ? "bg-blood-hot" : "bg-blood"}`}
            style={{ width: `${Math.max(0, Math.min(100, odds * 100))}%` }}
          />
        </div>

        <button
          type="button"
          onClick={onWitness}
          disabled={disabled}
          className={[
            "cursor-pointer border px-2 py-1 font-mono text-[9px] tracking-file transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isWitness
              ? "border-brass bg-brass/20 text-brass"
              : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
          ].join(" ")}
        >
          {isWitness ? "QUESTIONING" : "QUESTION"}
        </button>

        {turned && (
          <div className="absolute -right-1.5 -top-2 rotate-6 border border-blood-hot bg-ink px-1 py-0.5 font-mono text-[8px] tracking-file text-blood-hot">
            GOT TO THEM
          </div>
        )}
      </motion.div>
    </div>
  );
}
