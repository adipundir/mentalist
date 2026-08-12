"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BootScreen } from "@/components/BootScreen";
import * as sfx from "@/lib/sound";
import { PoweredBy } from "@/components/PoweredBy";

/**
 * The title card.
 *
 * A game's front door is a title, a promise, and a way in, not a README. Everything that
 * used to live here (how the mechanic works, why it needs confidential compute, the honest
 * TEE framing) is real and worth saying, but it belongs on /about, where someone who wants
 * it can go and find it.
 */
export default function Home() {
  const router = useRouter();
  const [booting, setBooting] = useState(false);

  // If the player has already interacted with the app, the title screen keeps the room tone
  // going instead of dropping to silence. On a first, cold visit the browser refuses and
  // this does nothing, which is the correct and unavoidable behaviour.
  useEffect(() => {
    if (sfx.audioReady()) sfx.startRoomTone();
    return () => sfx.stopRoomTone();
  }, []);

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-20 text-center">
      {/* the mark, watching */}
      <motion.svg
        viewBox="0 0 120 120"
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 0.11, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[78vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        {/* Drawn with three fingers, in a hurry, on a wall. Every stroke wobbles, thins
            where the hand lifted and pools where it pressed, and none of it closes cleanly:
            a compass-perfect circle is the one thing this mark should never look like. */}
        <g fill="none" stroke="#c1272d" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M60 15 C39 15 20 33 18 55 C16 76 30 98 51 104 C71 110 94 99 101 79 C108 60 99 33 78 21 C72 17 66 15.5 61 15.2"
            strokeWidth="7.5"
          />
          {/* the overlap where he came back round and did not quite meet his own line */}
          <path d="M61 15.2 C66 16 70 17.4 73 19" strokeWidth="5" opacity="0.85" />
          {/* the smile, heavier at the bottom of the arc where the fingers dragged */}
          <path d="M38 71 C45 87 60 93 72 89 C78 87 82 82 84 74" strokeWidth="7" />
          <path d="M46 80 C54 88 64 90 72 87" strokeWidth="3.4" opacity="0.55" />
        </g>

        {/* the eyes: three-finger dabs, not dots */}
        <g fill="#c1272d">
          <ellipse cx="44" cy="49" rx="5.4" ry="7.2" transform="rotate(-9 44 49)" />
          <g className="rj-wink">
            <ellipse cx="77" cy="48" rx="5.2" ry="7" transform="rotate(7 77 48)" />
          </g>
        </g>

        {/* What ran, while you were looking at it.
            Each drip draws itself downward on its own clock, so the wall is never quite
            finished. The bead at the end is the weight that pulled it. */}
        <g stroke="#a81f24" strokeLinecap="round" fill="none">
          {[
            { d: "M44.6 56 q1.2 9 0.4 15.5", w: 2.2, o: 0.75, len: 16, dur: 9, delay: 0 },
            { d: "M77.6 55 q-1 12 0.2 20", w: 1.9, o: 0.6, len: 21, dur: 13, delay: 3.5 },
            { d: "M101 79 q3 11 1.5 19", w: 2.4, o: 0.55, len: 20, dur: 11, delay: 6 },
            { d: "M18.4 55 q-2.4 8 -1 14", w: 2, o: 0.5, len: 15, dur: 15, delay: 1.5 },
            { d: "M60 92.5 q1 9 -0.4 16", w: 2.6, o: 0.65, len: 17, dur: 8, delay: 4.5 },
          ].map((r, i) => (
            <path
              key={i}
              d={r.d}
              strokeWidth={r.w}
              opacity={r.o}
              className="rj-drip"
              style={{
                strokeDasharray: r.len,
                ["--drip-len" as string]: r.len,
                animationDuration: `${r.dur}s`,
                animationDelay: `${r.delay}s`,
              }}
            />
          ))}
        </g>
      </motion.svg>

      {/* registration marks, the frame turns empty space into composition */}
      <div className="pointer-events-none absolute inset-5 sm:inset-8">
        {(
          [
            "left-0 top-0 border-l-2 border-t-2",
            "right-0 top-0 border-r-2 border-t-2",
            "left-0 bottom-0 border-b-2 border-l-2",
            "right-0 bottom-0 border-b-2 border-r-2",
          ] as const
        ).map((cls) => (
          <motion.span
            key={cls}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className={`absolute h-7 w-7 border-bone-dim/25 ${cls}`}
          />
        ))}
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="font-type text-[15vw] leading-[0.85] text-bone sm:text-[104px]"
      >
        MENTALIST
      </motion.h1>

      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32 }}
        onMouseEnter={() => sfx.tick(150, 0.05, 0.05)}
        onClick={() => {
          // The click is also what unlocks audio, so this is the first sound most players
          // hear. Give it some weight and start the room breathing underneath immediately,
          // rather than letting the loading screen run in silence.
          sfx.thud();
          sfx.knock();
          sfx.startRoomTone();
          setBooting(true);
        }}
        className="mt-9 cursor-pointer border-2 border-blood-hot bg-blood-hot/10 px-10 py-3 font-type text-[20px] tracking-wide text-blood-hot transition-colors hover:bg-blood-hot/25"
      >
        BEGIN
      </motion.button>

      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[10px] tracking-file text-bone-dim"
      >
        <Link href="/how-to-play" className="hover:text-bone">HOW TO PLAY</Link>
        <a
          href="https://github.com/adipundir/mentalist"
          target="_blank"
          rel="noreferrer"
          className="hover:text-bone"
        >
          SOURCE ↗
        </a>
      </motion.nav>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.32 }}>
        <PoweredBy fixed />
      </motion.div>

      <AnimatePresence>
        {booting && <BootScreen onReady={() => router.push("/cases")} />}
      </AnimatePresence>
    </main>
  );
}
