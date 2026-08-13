"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * The cold open.
 *
 * Four seconds before the home page: his signature painting itself on the wall, the drip
 * running out of it, and the name. It is the same mark the crime scenes carry, drawn rather
 * than placed, because watching a hand make it is the whole difference between a logo and a
 * threat.
 *
 * Silent on purpose. Browsers refuse audio before a gesture and there has not been one yet,
 * so a soundtrack here would play for nobody and be blamed on the site. The sound starts
 * where the click is, on BEGIN.
 *
 * Shown once a session. A cinematic you cannot get past is a cinematic that gets hated by the
 * third visit, so it is skippable on any key or click, and it never runs twice.
 */
const SEEN = "mentalist-cold-open";

export function ColdOpen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN)) return;
    sessionStorage.setItem(SEEN, "1");
    setShow(true);
    const done = () => setShow(false);
    const timer = setTimeout(done, 4600);
    window.addEventListener("keydown", done);
    window.addEventListener("pointerdown", done);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", done);
      window.removeEventListener("pointerdown", done);
    };
  }, []);

  // A stroke that paints itself: the dash covers the whole path, then the offset walks it on.
  const paint = (delay: number, duration: number) => ({
    initial: { pathLength: 0, opacity: 0.9 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { delay, duration, ease: [0.4, 0, 0.4, 1] as const },
  });

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-ink"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          {/* the wall he painted it on */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 42%, rgb(28 18 18) 0%, rgb(10 7 8) 55%, rgb(6 5 7) 100%)",
            }}
          />

          <svg viewBox="-30 -30 60 60" className="relative h-[42vmin] w-[42vmin]">
            <g
              fill="none"
              stroke="rgb(var(--blood-hot))"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 6px rgb(var(--blood) / 0.55))" }}
            >
              {/* the face, opened at the top left the way a finger starts and finishes */}
              <motion.path
                d="M -3 -20.6 A 21 21 0 1 1 -5.5 -20.1"
                strokeWidth="2.6"
                {...paint(0.25, 1.15)}
              />
              {/* the eyes, stabbed in rather than drawn */}
              <motion.path
                d="M-8.6 -7 l0 0"
                strokeWidth="6"
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.5, duration: 0.18 }}
              />
              <motion.path
                d="M8.6 -7 l0 0"
                strokeWidth="6"
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.72, duration: 0.18 }}
              />
              {/* the smile, last, and slower than the rest */}
              <motion.path d="M-10 4.5 Q0 15.5 10 4.5" strokeWidth="2.6" {...paint(2.0, 0.85)} />
            </g>

            {/* it ran, because it was painted with a finger and nobody waited for it to dry */}
            <motion.path
              d="M13.4 10.5 q1.3 7.5 -0.4 14.5"
              fill="none"
              stroke="rgb(var(--blood))"
              strokeWidth="1.15"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.85 }}
              transition={{ delay: 2.75, duration: 1.5, ease: "easeIn" }}
            />
          </svg>

          <motion.p
            className="relative mt-6 font-type text-[34px] tracking-wide text-bone sm:text-[46px]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 3.1, duration: 0.9 }}
          >
            MENTALIST
          </motion.p>

          <motion.p
            className="relative mt-8 font-mono text-[9px] tracking-file text-bone-dim/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3.9, duration: 0.6 }}
          >
            CLICK ANYWHERE TO SKIP
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
