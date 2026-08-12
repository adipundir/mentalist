"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { CHAPTERS, FINALE } from "@/lib/story";
import { lineup, person } from "@/lib/canon";
import { localOracle } from "@/lib/oracle";
import { chainOracle, getZap, type ChainOracle } from "@/lib/chain-oracle";
import { MENTALIST_ADDRESS, addressUrl, txUrl } from "@/lib/contracts";
import { Scene } from "@/components/Scene";
import { StoryCard } from "@/components/StoryCard";
import { Finale } from "@/components/Finale";
import { ModePicker, type PlayMode } from "@/components/ModePicker";
import { Settlement } from "@/components/Settlement";

type Stage = "mode" | "opening" | "playing" | "closing" | "finale";

/**
 * THE LIST — the campaign, and the game's main loop.
 *
 * Seven chapters following the real arc, the lineup shrinking the way the suspect list
 * does. Playable two ways, chosen up front:
 *
 *   - **On-chain.** Every chapter opens a real case on Base Sepolia; Red John is placed
 *     inside Inco's enclave, every answer is decrypted for this player alone, the verdict
 *     is settled by the contract against a covalidator attestation, and surplus Focus buys
 *     real Megapot tickets. About 10s a question, and the game is built to make that a
 *     dramatic beat rather than a stall.
 *   - **Practice.** The identical rules dealt locally, instant, no wallet.
 *
 * Both are first-class. That matters: the jam requires the integration to sit in the main
 * user loop, and a campaign that quietly ran offline while the "real" game hid on another
 * route would not qualify — but a campaign that *demanded* a funded wallet would be
 * unplayable for anyone who just wants to see it.
 */
function StoryInner() {
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("mode");
  const [solved, setSolved] = useState(false);
  const [focusLeft, setFocusLeft] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [txs, setTxs] = useState<{ hash: string; label: string }[]>([]);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    void getZap().catch(() => {});
  }, []);

  const chapter = CHAPTERS[index];
  const suspects = useMemo(() => lineup(chapter.roster), [chapter]);
  const culpritSeat = chapter.roster.indexOf(chapter.culprit);

  // The oracle is the only thing that differs between the two modes. Everything above it —
  // the rules, the scene, the story — is identical, which is what makes practice an honest
  // representation of the real game rather than a different game wearing its clothes.
  const oracle = useMemo(() => {
    if (mode === "chain" && publicClient && walletClient && address) {
      return chainOracle({
        publicClient,
        walletClient,
        account: address,
        onTx: (hash, label) => setTxs((t) => [{ hash, label }, ...t].slice(0, 6)),
      });
    }
    return localOracle(culpritSeat);
  }, [mode, publicClient, walletClient, address, culpritSeat, index, attempt]);

  const onChain = mode === "chain";
  const isLast = index === CHAPTERS.length - 1;

  function finishChapter(didSolve: boolean, left: number) {
    setSolved(didSolve);
    setFocusLeft(left);
    setStage("closing");
  }

  function advance() {
    if (!solved) {
      setAttempt((a) => a + 1);
      setStage("opening");
      return;
    }
    if (isLast) {
      setStage("finale");
      return;
    }
    setIndex((i) => i + 1);
    setAttempt(0);
    setTxs([]);
    setStage("opening");
  }

  return (
    <main>
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-4 pt-4 sm:px-6">
        <Link href="/" className="font-type text-[15px] tracking-wide text-bone-dim hover:text-bone">
          MENTALIST
        </Link>
        <span className="text-bone-dim/30">/</span>
        <span className="font-mono text-[9px] tracking-file text-blood-hot">THE LIST</span>

        <ol className="ml-1 flex flex-wrap items-center gap-1">
          {CHAPTERS.map((c, i) => (
            <li
              key={c.title}
              title={`${c.label} — ${c.title}`}
              className={[
                "h-1.5 w-6 border",
                i < index ? "border-brass bg-brass" : i === index ? "border-blood-hot bg-blood-hot" : "border-ink-3",
              ].join(" ")}
            />
          ))}
        </ol>

        {mode && (
          <span
            className={[
              "ml-auto border px-2 py-0.5 font-mono text-[9px] tracking-file",
              onChain ? "border-blood-hot text-blood-hot" : "border-ink-3 text-bone-dim",
            ].join(" ")}
          >
            {onChain ? "ON-CHAIN · BASE SEPOLIA" : "PRACTICE · OFFLINE"}
          </span>
        )}
      </div>

      <div className="px-2 pb-8 pt-3 sm:px-4">
        <Scene
          key={`${mode}-${index}-${attempt}`}
          config={chapter}
          oracle={oracle}
          suspects={suspects}
          title={chapter.title}
          chapter={`${chapter.label} · ${chapter.n} SUSPECTS · ${chapter.liars} LYING`}
          nudge={{
            name: person(chapter.nudge.speaker).name,
            spec: { ...person(chapter.nudge.speaker).character, id: chapter.nudge.speaker },
            line: chapter.nudge.line,
          }}
          chainStatus={
            onChain ? (
              <div className="crt max-w-[280px] border border-ink-3 p-2 font-mono text-[9px] leading-relaxed tracking-file">
                <p>
                  ENCRYPTED ON BASE ·{" "}
                  <a href={addressUrl(MENTALIST_ADDRESS)} target="_blank" rel="noreferrer" className="underline">
                    {MENTALIST_ADDRESS.slice(0, 8)}… ↗
                  </a>
                </p>
                {txs.length === 0 ? (
                  <p className="opacity-60">DEALING THE CASE…</p>
                ) : (
                  <ul className="space-y-0.5">
                    {txs.map((t) => (
                      <li key={t.hash} className="truncate">
                        <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="underline">
                          {t.hash.slice(0, 10)}…
                        </a>{" "}
                        <span className="opacity-70">{t.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null
          }
          onResolved={finishChapter}
        />
      </div>

      <AnimatePresence>
        {stage === "mode" && <ModePicker onPick={(m) => { setMode(m); setStage("opening"); }} />}

        {stage === "opening" && (
          <StoryCard
            key={`open-${index}-${attempt}`}
            chapter={`${chapter.label} — ${chapter.n} SUSPECTS · ${chapter.liars} LIARS · ${chapter.focus} FOCUS`}
            title={chapter.title}
            body={chapter.opening}
            onContinue={() => setStage("playing")}
            continueLabel="WORK THE ROOM"
          />
        )}

        {stage === "closing" && (
          <StoryCard
            key={`close-${index}-${attempt}`}
            chapter={solved ? "CASE CLOSED" : "HE WALKED"}
            title={chapter.title}
            body={solved ? chapter.successText : chapter.failureText}
            onContinue={advance}
            continueLabel={solved ? (isLast ? "THE CREEK" : "NEXT CHAPTER") : "TRY AGAIN"}
            extra={
              onChain ? (
                <Settlement
                  oracle={oracle as ChainOracle}
                  solved={solved}
                  focusLeft={focusLeft}
                />
              ) : null
            }
          />
        )}

        {stage === "finale" && <Finale beats={FINALE} />}
      </AnimatePresence>
    </main>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={<p className="p-8 font-mono text-[11px] tracking-file text-bone-dim">PULLING THE FILE…</p>}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <StoryInner />
      </motion.div>
    </Suspense>
  );
}
