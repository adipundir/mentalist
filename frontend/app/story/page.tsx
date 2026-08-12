"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { CHAPTERS, FINALE } from "@/lib/story";
import { lineup, person } from "@/lib/canon";
import { chainOracle, getZap, type ChainOracle } from "@/lib/chain-oracle";
import { CASE_WINDOW_MS } from "@/lib/market";
import { Scene } from "@/components/Scene";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { StoryCard } from "@/components/StoryCard";
import { Finale } from "@/components/Finale";
import { PoweredBy } from "@/components/PoweredBy";
import { Settlement } from "@/components/Settlement";

type Stage = "opening" | "playing" | "closing" | "finale";

/**
 * THE RED JOHN CASES, the game.
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
  const [stage, setStage] = useState<Stage>("opening");
  const [solved, setSolved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [txs, setTxs] = useState<{ hash: string; label: string }[]>([]);

  // Each case stands for a fixed window. Set once per case so the clock does not restart
  // every render.
  const [closesAt, setClosesAt] = useState(() => Date.now() + CASE_WINDOW_MS);
  useEffect(() => setClosesAt(Date.now() + CASE_WINDOW_MS), [index]);

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

  function finishChapter(didSolve: boolean) {
    setSolved(didSolve);
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
    <main className="fixed inset-0 overflow-hidden">
      {/* The masthead rides on top of the room rather than above it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex flex-wrap items-center gap-3 px-4 pb-6 pt-4 sm:px-7"
        style={{ background: "linear-gradient(rgb(6 5 7 / 0.92), transparent)" }}
      >
        <Link href="/" className="pointer-events-auto font-type text-[15px] tracking-wide text-bone hover:text-blood-hot">
          MENTALIST
        </Link>
        <span className="text-bone-dim">/</span>
        <span className="font-mono text-[10px] tracking-file text-blood-hot">THE RED JOHN CASES</span>

        <ol className="ml-1 flex flex-wrap items-center gap-1">
          {CHAPTERS.map((c, i) => (
            <li
              key={c.title}
              title={`${c.label}, ${c.title}`}
              className={[
                "h-1.5 w-6 border",
                i < index ? "border-brass bg-brass" : i === index ? "border-blood-hot bg-blood-hot" : "border-ink-3",
              ].join(" ")}
            />
          ))}
        </ol>

        <span className="ml-auto border border-blood-hot/70 bg-blood-hot/15 px-2 py-1 font-mono text-[10px] tracking-file text-blood-hot">
          BASE SEPOLIA
        </span>
      </div>

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
          closesAt={closesAt}
          variant={index}
          connect={
            oracle ? null : (
              <>
                <p className="font-body text-[15px] text-bone">
                  They&rsquo;re waiting.{" "}
                  <span className="text-blood-hot">Connect to open the case.</span>
                </p>
                <ConnectButton showBalance={false} chainStatus="icon" />
              </>
            )
          }
          onResolved={finishChapter}
        />

      <AnimatePresence>

        {stage === "opening" && oracle && (
          <StoryCard
            key={`open-${index}-${attempt}`}
            chapter={`CASE ${index + 1} OF ${CHAPTERS.length}, ${chapter.n} SUSPECTS, ${chapter.liars} OF THEM LYING`}
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
                <Settlement oracle={oracle} solved={solved} />
              ) : null
            }
          />
        )}

        {stage === "finale" && <Finale beats={FINALE} />}
      </AnimatePresence>

      <PoweredBy fixed />
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
