"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { CHAPTERS, FINALE } from "@/lib/story";
import { lineup, person } from "@/lib/canon";
import { chainOracle, getZap, type ChainOracle } from "@/lib/chain-oracle";
import { MENTALIST_ADDRESS, addressUrl, txUrl } from "@/lib/contracts";
import { Scene } from "@/components/Scene";
import { Room } from "@/components/Room";
import { StoryCard } from "@/components/StoryCard";
import { Finale } from "@/components/Finale";
import { Gate } from "@/components/Gate";
import { Settlement } from "@/components/Settlement";

type Stage = "gate" | "opening" | "playing" | "closing" | "finale";

/**
 * THE RED JOHN CASES — the game.
 *
 * Seven cases following the real arc, the lineup shrinking the way the suspect list does.
 *
 * Every case runs on Base Sepolia: Red John is placed inside Inco's enclave, each answer is
 * decrypted for this player alone, the verdict is settled by the contract against a
 * covalidator attestation, and unspent questions buy real Megapot tickets. About ten
 * seconds a question, which the scene is built to spend as a dramatic beat rather than a
 * stall.
 */
function StoryInner() {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("gate");
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

  // Every case is dealt and answered on-chain. There is no local fallback: a simulation of
  // the game would be a different game, and the whole point is that the secret is somewhere
  // neither the player nor the page can reach.
  const oracle = useMemo(() => {
    if (!publicClient || !walletClient || !address) return null;
    return chainOracle({
      publicClient,
      walletClient,
      account: address,
      onTx: (hash, label) => setTxs((t) => [{ hash, label }, ...t].slice(0, 6)),
    });
  }, [publicClient, walletClient, address, index, attempt]);

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
        <span className="font-mono text-[9px] tracking-file text-blood-hot">THE RED JOHN CASES</span>

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

        <span className="ml-auto border border-blood-hot px-2 py-0.5 font-mono text-[9px] tracking-file text-blood-hot">
          BASE SEPOLIA
        </span>
      </div>

      <div className="px-2 pb-8 pt-3 sm:px-4">
        {oracle ? (
        <Scene
          key={`${index}-${attempt}`}
          config={chapter}
          oracle={oracle}
          suspects={suspects}
          title={chapter.title}
          chapter={`CASE ${index + 1} OF ${CHAPTERS.length}`}
          nudge={{
            name: person(chapter.nudge.speaker).name,
            spec: { ...person(chapter.nudge.speaker).character, id: chapter.nudge.speaker },
            line: chapter.nudge.line,
          }}
          chainStatus={
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
          }
          onResolved={finishChapter}
        />
        ) : (
          <div className="relative mx-auto w-full max-w-[1400px]">
            <Room
              subjects={suspects.map((sp, i) => ({
                suspect: sp,
                expression: i % 3 === 0 ? "smug" : "neutral",
                cleared: false,
                liar: false,
                honest: false,
                inQuestion: false,
                turned: false,
                saying: null,
              }))}
              focused={null}
              onFocus={() => {}}
              onToggle={() => {}}
              disabled
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {stage === "gate" && <Gate onReady={() => setStage("opening")} />}

        {stage === "opening" && (
          <StoryCard
            key={`open-${index}-${attempt}`}
            chapter={`CASE ${index + 1} OF ${CHAPTERS.length} — ${chapter.n} SUSPECTS, ${chapter.liars} OF THEM LYING`}
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
            continueLabel={solved ? (isLast ? "THE CREEK" : "NEXT CASE") : "TRY AGAIN"}
            extra={
              oracle ? (
                <Settlement oracle={oracle} solved={solved} focusLeft={focusLeft} />
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
