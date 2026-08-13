"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RedJohnMark } from "@/components/RedJohnMark";

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

/** The wet edge of the wipe: opaque behind it, nothing in front of it, soft in between. */
const MASK = "linear-gradient(to bottom, #000 calc(var(--paint) - 13%), transparent var(--paint))";

/** How long the hand takes, plus the beat it hangs before the mask is dropped for good. */
const PAINT_MS = 2900;

export function ColdOpen() {
  const [show, setShow] = useState(false);
  // The wipe is driven by a custom property, and a browser that will not animate one would
  // otherwise hold the mask at its starting value forever — an empty wall for four seconds.
  // Once the stroke has had its time, the mask comes off and the mark is simply there.
  const [painted, setPainted] = useState(false);
  // Whether this mount plays, decided once. The check has to be separate from the effect
  // body: in dev the effect runs twice, and a version that wrote the session flag on the
  // way past would make the second pass bail out — leaving the film on screen with its
  // timer cleared and its skip listeners removed, which is a locked door.
  const plays = useRef<boolean | null>(null);

  useEffect(() => {
    if (plays.current === null) {
      plays.current = !sessionStorage.getItem(SEEN);
      sessionStorage.setItem(SEEN, "1");
    }
    if (!plays.current) return;
    setShow(true);
    const done = () => setShow(false);
    const dry = setTimeout(() => setPainted(true), PAINT_MS);
    const timer = setTimeout(done, 4600);
    window.addEventListener("keydown", done);
    window.addEventListener("pointerdown", done);
    return () => {
      clearTimeout(dry);
      clearTimeout(timer);
      window.removeEventListener("keydown", done);
      window.removeEventListener("pointerdown", done);
    };
  }, []);

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

          {/* The mark, painting itself on.
              A soft-edged wipe walks down the image, so the circle arrives first and the
              runs arrive last, in the order a hand and gravity would have put them there.
              The safety below drops the mask outright if the browser will not animate the
              custom property, because a mark that never finishes arriving is a black screen. */}
          <motion.div
            className="relative h-[46vmin] w-[46vmin]"
            initial={{ ["--paint" as string]: "0%" }}
            animate={{ ["--paint" as string]: "125%" }}
            transition={{ delay: 0.25, duration: 2.4, ease: [0.4, 0, 0.4, 1] }}
            style={{
              filter: "drop-shadow(0 0 14px rgb(var(--blood) / 0.4))",
              ...(painted
                ? {}
                : {
                    WebkitMaskImage: MASK,
                    maskImage: MASK,
                  }),
            }}
          >
            <RedJohnMark className="h-full w-full object-contain" />
          </motion.div>

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
