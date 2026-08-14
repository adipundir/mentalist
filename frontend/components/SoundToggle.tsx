"use client";

import { useState } from "react";
import { isMuted, setMuted } from "@/lib/sound";

/**
 * The one control for the sound effects.
 *
 * `setMuted` in `lib/sound` has always worked and nothing on any screen could reach it, so
 * the game shipped a room tone, knocks and brass stings a player had no way to stop. The
 * narration toggle on the story card is a different switch entirely: it silences the voice,
 * not the room.
 *
 * It sits in the root layout rather than beside that toggle because the sounds it silences
 * play on every screen and the card is only on one of them. Below the boot overlay in the
 * stack, so it does not sit over the mark being drawn, and above everything else.
 */
export function SoundToggle() {
  // Starts false on the server and on the first paint, which is where `isMuted` starts too,
  // so there is nothing for hydration to disagree about.
  const [off, setOff] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !isMuted();
        setMuted(next);
        setOff(next);
      }}
      className="fixed bottom-3 right-3 z-[90] cursor-pointer border border-ink-3 bg-ink/80 px-2 py-1 font-mono text-[9px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
    >
      {off ? "SOUND: OFF" : "SOUND: ON"}
    </button>
  );
}
