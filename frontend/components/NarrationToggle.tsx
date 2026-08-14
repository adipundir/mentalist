"use client";

import { useState } from "react";
import { isVoiceMuted, setVoiceMuted } from "@/lib/voice";

/**
 * The voice, off everywhere.
 *
 * There was already a narration switch, but it lived on the case card, which is one screen
 * of several and gone the moment the player clicks past it — so a player who decided
 * mid-room that they had heard enough had no way to say so. This one sits in the root
 * layout beside the sound switch and holds for the whole session.
 *
 * The only switch on screen now. The sound toggle that used to sit beside it went with the
 * music it existed to silence; what is left is short, occasional and tied to something the
 * player just did, which nobody needs a control for. The voice is different: it is long, it
 * talks over you, and it is the one sound a player might want gone while keeping the game.
 */
export function NarrationToggle() {
  // Starts false on the server and on the first paint, matching the module's own default,
  // so there is nothing for hydration to disagree about.
  const [off, setOff] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        // `setVoiceMuted` also stops whoever is mid-sentence, rather than letting them
        // finish the paragraph the player just asked to be rid of.
        const next = !isVoiceMuted();
        setVoiceMuted(next);
        setOff(next);
      }}
      className="fixed bottom-3 right-3 z-[90] cursor-pointer border border-ink-3 bg-ink/80 px-2 py-1 font-mono text-[9px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
    >
      {off ? "NARRATION: OFF" : "NARRATION: ON"}
    </button>
  );
}
