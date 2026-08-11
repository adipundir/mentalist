"use client";

import type { Phase } from "@/lib/case";

/**
 * One click crosses up to four async stages with wildly different wait profiles. A single
 * "Loading…" averages them into "is it broken?"; naming the stage keeps every wait legible,
 * and the copy stays in fiction so the wait reads as deliberation rather than lag.
 */
const COPY: Record<Exclude<Phase, "idle">, { label: string; note: string }> = {
  encrypting: { label: "SEALING THE QUESTION", note: "encrypting locally" },
  "confirm-in-wallet": { label: "SIGN IT AND HAND IT OVER", note: "waiting on your wallet" },
  mining: { label: "FILING WITH THE REGISTRY", note: "submitting to Base" },
  reading: { label: "THEY'RE CHOOSING THEIR WORDS", note: "decrypting inside the enclave" },
  revealing: { label: "OPENING THE FILE", note: "revealing the board" },
};

export function PhaseBanner({ phase }: { phase: Phase }) {
  if (phase === "idle") return null;
  const copy = COPY[phase];

  return (
    <p className="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-file">
      <span className="breathe inline-block h-1.5 w-1.5 bg-blood-hot" aria-hidden />
      <span className="text-blood-hot">{copy.label}</span>
      <span className="text-bone-dim/50">— {copy.note}</span>
    </p>
  );
}
