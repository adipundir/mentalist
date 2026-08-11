"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CHAPTERS, FINALE } from "@/lib/story";
import { lineup, person } from "@/lib/canon";
import { localOracle } from "@/lib/oracle";
import { Scene } from "@/components/Scene";
import { StoryCard } from "@/components/StoryCard";
import { Finale } from "@/components/Finale";

type Stage = "opening" | "playing" | "closing" | "finale";

/**
 * THE LIST — the campaign.
 *
 * Seven chapters, the lineup shrinking the way the real suspect list does. It runs on the
 * local oracle deliberately: story mode wants pace, and an eleven-second covalidator wait
 * per question would strand the player mid-sentence. The on-chain proof lives in free play,
 * where the wait is the point.
 */
function StoryInner() {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("opening");
  const [solved, setSolved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const chapter = CHAPTERS[index];
  const suspects = useMemo(() => lineup(chapter.roster), [chapter]);
  const culpritSeat = chapter.roster.indexOf(chapter.culprit);

  // A fresh oracle per attempt; the culprit is who the story says it is.
  const oracle = useMemo(() => localOracle(culpritSeat), [culpritSeat, index, attempt]);

  const isLast = index === CHAPTERS.length - 1;

  function finishChapter(didSolve: boolean) {
    setSolved(didSolve);
    setStage("closing");
  }

  function advance() {
    if (!solved) {
      // A miss replays the chapter — the arc doesn't move until you get it right.
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
    setStage("opening");
  }

  return (
    <main>
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-3 px-4 pt-5 sm:px-6">
        <Link href="/" className="font-type text-[15px] tracking-wide text-bone-dim hover:text-bone">
          MENTALIST
        </Link>
        <span className="text-bone-dim/30">/</span>
        <span className="font-mono text-[9px] tracking-file text-blood-hot">THE LIST</span>

        <ol className="ml-2 flex flex-wrap items-center gap-1">
          {CHAPTERS.map((c, i) => (
            <li
              key={c.title}
              title={`${c.label} — ${c.title}`}
              className={[
                "h-1.5 w-7 border",
                i < index
                  ? "border-brass bg-brass"
                  : i === index
                    ? "border-blood-hot bg-blood-hot"
                    : "border-ink-3",
              ].join(" ")}
            />
          ))}
        </ol>
        <span className="font-mono text-[9px] tracking-file text-bone-dim">
          {chapter.label} · {chapter.n} SUSPECTS
        </span>
      </div>

      <div className="px-2 pb-8 pt-3 sm:px-4">
        <Scene
          key={`${index}-${attempt}`}
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
          onResolved={finishChapter}
        />
      </div>

      <AnimatePresence>
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
      fallback={
        <p className="p-8 font-mono text-[11px] tracking-file text-bone-dim">PULLING THE FILE…</p>
      }
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <StoryInner />
      </motion.div>
    </Suspense>
  );
}
