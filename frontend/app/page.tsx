"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { IntroVideo } from "@/components/IntroVideo";
import { RedJohnMark } from "@/components/RedJohnMark";
import * as sfx from "@/lib/sound";
import { PoweredBy } from "@/components/PoweredBy";

/**
 * The title card.
 *
 * A game's front door is a title, a promise, and a way in, not a README. Everything that
 * used to live here (how the mechanic works, why it needs confidential compute, the honest
 */
export default function Home() {
  const router = useRouter();
  const [booting, setBooting] = useState(false);

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-20 text-center">
      {/* The mark, watching.
          It is behind the title, so it has to lose every argument with it: graded off its
          native brown towards the blood the rest of the palette uses, faded out at the
          edges so it sits in the wall instead of on it, and kept small enough that the
          type crosses one stroke rather than four. */}
      <motion.div
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 0.16, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="pointer-events-none absolute left-1/2 top-[47%] h-[58vmin] w-[58vmin] -translate-x-1/2 -translate-y-1/2"
        style={{
          maskImage: "radial-gradient(68% 68% at 50% 46%, #000 55%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(68% 68% at 50% 46%, #000 55%, transparent 100%)",
        }}
        aria-hidden
      >
        <RedJohnMark
          className="h-full w-full object-contain"
          style={{ filter: "saturate(1.45) hue-rotate(-10deg) contrast(1.1) brightness(1.15)" }}
        />
      </motion.div>

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
          setBooting(true);
        }}
        className="mt-9 cursor-pointer border-2 border-blood-hot bg-blood-hot/10 px-10 py-3 font-type text-[20px] tracking-wide text-blood-hot transition-colors hover:bg-blood-hot/25"
      >
        START
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

      {/* The intro film needs the presence wrapper to fade out on its way to the board.
          The cold open brings its own, so it sits outside this one rather than becoming an
          unkeyed second child of it. */}
      <AnimatePresence>
        {booting && <IntroVideo onReady={() => router.push("/cases")} />}
      </AnimatePresence>

    </main>
  );
}
