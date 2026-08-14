"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { loadVoices, unlockNarrator } from "@/lib/narrator";

/**
 * The loading screen, which is a film.
 *
 * It runs after BEGIN, so the click has already bought the two things a browser will not
 * give before a gesture: an unlocked audio context and the narrator's voice list. Both are
 * loaded underneath the video rather than on a screen of their own, along with the webfonts,
 * so the wait is spent watching something instead of watching a bar.
 *
 * It fades up from black, plays once, fades back to black, and only then hands over to the
 * board. If the file will not play at all, the handover still happens — a broken video must
 * never be the reason a player cannot reach the game.
 */
/** How long the film takes to go, and how early it has to start going. */
const FADE_OUT = 1;

export function IntroVideo({ onReady }: { onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const finished = useRef(false);
  const [leaving, setLeaving] = useState(false);
  // How long the exit takes, which is not always FADE_OUT: a frozen last frame or a file
  // that never played should go quickly, because there is nothing left to watch.
  const [fade, setFade] = useState(FADE_OUT);

  // The fade to black, then the room on the other side of it.
  const end = useCallback((seconds: number) => {
    if (finished.current) return;
    finished.current = true;
    setFade(seconds);
    setLeaving(true);
  }, []);

  // Everything here is work the first scene needs done regardless of the film.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    unlockNarrator();
    void loadVoices();
    if (typeof document !== "undefined" && "fonts" in document) {
      void (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }

    // Autoplay with sound is allowed here because BEGIN was a gesture, but a stricter
    // policy can still refuse it. Muted playback beats no playback.
    const el = videoRef.current;
    el?.play().catch(() => {
      if (!el) return;
      el.muted = true;
      el.play().catch(() => end(0.3));
    });
  }, [end]);

  // The fade has to start while the film is still running. `ended` fires with the last
  // frame already frozen on screen, so a fade hung off it reads as a stall followed by a
  // dissolve; this watches the clock instead and begins the exit a second out, so the
  // picture is still moving as it goes. The sound rides the same ramp — an audio track cut
  // dead under a faded-out picture is the same problem with different senses.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let raf = 0;
    const watch = () => {
      raf = requestAnimationFrame(watch);
      const { currentTime, duration } = el;
      if (!Number.isFinite(duration) || duration <= 0) return;
      // A film shorter than the fade gets half of itself instead, rather than starting to
      // leave before it has arrived.
      const span = Math.min(FADE_OUT, duration / 2);
      const remaining = duration - currentTime;
      if (remaining > span) return;
      end(span);
      if (!el.muted) el.volume = Math.max(0, remaining / span);
    };
    raf = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(raf);
  }, [end]);

  return (
    // The black plate. It covers the title screen for the whole sequence and never fades
    // back out: what fades is the film on top of it, so the last thing before the board is
    // an empty frame rather than the page we just left.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-ink"
    >
      <motion.video
        ref={videoRef}
        src="/intro.mp4"
        autoPlay
        playsInline
        preload="auto"
        /* Backstops. The clock watcher above normally gets there first; these only fire when
           it cannot — no readable duration, or a file that will not play at all — and by then
           the picture is frozen or absent, so they go quickly. */
        onEnded={() => end(0.3)}
        onError={() => end(0.3)}
        // Pushed in 10%, because the file carries its own letterbox and `cover` alone still
        // leaves those baked-in bars on screen. The overflow is clipped by the plate.
        initial={{ opacity: 0, scale: 1.12 }}
        animate={{ opacity: leaving ? 0 : 1, scale: 1.12 }}
        transition={{ duration: leaving ? fade : 0.7, ease: "easeInOut" }}
        onAnimationComplete={() => {
          if (!leaving) return;
          // A beat of nothing before the board, so the cut does not land on the tail of the
          // fade. Nothing is started here: the board is silent, and the room's own air comes
          // up when the player is actually standing in a room.
          setTimeout(onReady, 320);
        }}
        className="h-full w-full object-cover"
      />

      {/* Something that says the wait is doing work.
          A film with no caption is a film a player watches wondering whether the button
          they pressed did anything, so this says what is happening underneath it. It fades
          with the picture rather than sitting on the empty black at the end. */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: leaving ? fade : 0.9, ease: "easeInOut" }}
        className="pointer-events-none absolute bottom-6 right-6 font-mono text-[13px] tracking-file text-bone drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
      >
        LOADING CASES<span className="caret" />
      </motion.p>
    </motion.div>
  );
}
