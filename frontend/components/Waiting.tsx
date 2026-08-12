"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Phase } from "@/lib/case";

/**
 * The ten-second beat.
 *
 * On-chain, a question costs ~10s: about 2.2s to mine and about 8s for the covalidator to
 * decrypt an answer that only this player is allowed to read. That latency is not going
 * away, so it has to become part of the game rather than a stall in front of it.
 *
 * Two things make it work. First, the copy stays inside the fiction and *names the real
 * stage*, a player who knows the enclave is deciding is waiting on something, whereas a
 * player watching a spinner is waiting on nothing. Second, the beats are staged: the room
 * files the question, the witness takes their time, the answer comes back sealed. Ten
 * seconds of a suspect refusing to answer is the tensest thing in an interrogation; ten
 * seconds of a progress bar is a bug report.
 */

const BEATS: Record<Exclude<Phase, "idle">, { line: string; note: string }[]> = {
  encrypting: [{ line: "Sealing the question", note: "encrypting locally" }],
  "confirm-in-wallet": [{ line: "Sign it and hand it over", note: "waiting on your wallet" }],
  mining: [
    { line: "Filing with the registry", note: "submitting to Base" },
    { line: "The room goes quiet", note: "waiting for the block" },
  ],
  reading: [
    { line: "They're choosing their words", note: "the enclave is deciding" },
    { line: "Nobody else will hear this", note: "decrypting, for you alone" },
    { line: "Still choosing", note: "covalidator attesting" },
  ],
  revealing: [
    { line: "Opening the file", note: "revealing the board" },
    { line: "Everything at once", note: "attesting every seat" },
  ],
};

export function Waiting({ phase }: { phase: Phase }) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    setBeat(0);
    if (phase === "idle") return;
    // Rotate through the beats so a long wait reads as a sequence of moments rather than
    // one frozen label.
    const id = setInterval(() => setBeat((b) => b + 1), 2600);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "idle") return null;

  const bank = BEATS[phase];
  const { line, note } = bank[beat % bank.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-3"
    >
      {/* a pulse, not a spinner, a spinner says "loading", a pulse says "thinking" */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood-hot opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blood-hot" />
      </span>

      <motion.span key={line} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0">
        <span className="font-body text-[14px] italic text-bone">{line}</span>
        <span className="ml-2 font-mono text-[9px] tracking-file text-bone-dim/75">{note}</span>
      </motion.span>
    </motion.div>
  );
}
