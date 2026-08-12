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
        transition={{ duration: 2.4, ease: "easeOut" }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[78vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        <circle cx="60" cy="60" r="44" fill="none" stroke="#c1272d" strokeWidth="5" />
        <path d="M44 48 L44 48 M76 48 L76 48" stroke="#c1272d" strokeWidth="12" strokeLinecap="round" />
        <path d="M40 74 Q60 92 80 74" fill="none" stroke="#c1272d" strokeWidth="5" strokeLinecap="round" />
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
            transition={{ delay: 1.5, duration: 0.8 }}
            className={`absolute h-7 w-7 border-bone-dim/25 ${cls}`}
          />
        ))}
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="font-type text-[15vw] leading-[0.85] text-bone sm:text-[104px]"
      >
        MENTALIST
      </motion.h1>

      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
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
        transition={{ delay: 1.3 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[10px] tracking-file text-bone-dim"
      >
        <Link href="/about" className="hover:text-bone">HOW IT WORKS</Link>
        <a
          href="https://github.com/adipundir/mentalist"
          target="_blank"
          rel="noreferrer"
          className="hover:text-bone"
        >
          SOURCE ↗
        </a>
      </motion.nav>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
        <PoweredBy fixed />
      </motion.div>

      <AnimatePresence>
        {booting && <BootScreen onReady={() => router.push("/cases")} />}
      </AnimatePresence>
    </main>
  );
}
