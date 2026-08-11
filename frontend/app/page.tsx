"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BootScreen } from "@/components/BootScreen";
import * as sfx from "@/lib/sound";

/**
 * The title card.
 *
 * A game's front door is a title, a promise, and a way in — not a README. Everything that
 * used to live here (how the mechanic works, why it needs confidential compute, the honest
 * TEE framing) is real and worth saying, but it belongs on /about, where someone who wants
 * it can go and find it.
 */
export default function Home() {
  const router = useRouter();
  const [booting, setBooting] = useState(false);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {/* the mark, watching */}
      <svg
        viewBox="0 0 120 120"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 opacity-[0.05]"
        aria-hidden
      >
        <circle cx="60" cy="60" r="44" fill="none" stroke="#c1272d" strokeWidth="6" />
        <path d="M44 48 L44 48 M76 48 L76 48" stroke="#c1272d" strokeWidth="13" strokeLinecap="round" />
        <path d="M40 74 Q60 92 80 74" fill="none" stroke="#c1272d" strokeWidth="6" strokeLinecap="round" />
      </svg>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="font-mono text-[10px] tracking-file text-bone-dim"
      >
        CBI · SERIAL CRIMES · CASE FILE OPEN
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mt-2 font-type text-[15vw] leading-[0.85] text-bone sm:text-[104px]"
      >
        MENTALIST
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-5 max-w-[30ch] font-body text-[19px] leading-snug text-bone sm:text-[22px]"
      >
        Everyone in the room is lying to you.
        <br />
        <span className="text-blood-hot">Red John always does.</span>
      </motion.p>

      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={() => {
          sfx.knock();
          setBooting(true);
        }}
        className="mt-10 cursor-pointer border-2 border-blood-hot bg-blood-hot/10 px-10 py-3 font-type text-[20px] tracking-wide text-blood-hot transition-colors hover:bg-blood-hot/25"
      >
        BEGIN
      </motion.button>

      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[10px] tracking-file text-bone-dim"
      >
        <Link href="/case/demo" className="hover:text-bone">SINGLE CASE</Link>
        <Link href="/case/play" className="hover:text-bone">PLAY ON-CHAIN ↗</Link>
        <Link href="/about" className="hover:text-bone">HOW IT WORKS</Link>
      </motion.nav>

      <AnimatePresence>
        {booting && <BootScreen onReady={() => router.push("/story")} />}
      </AnimatePresence>
    </main>
  );
}
