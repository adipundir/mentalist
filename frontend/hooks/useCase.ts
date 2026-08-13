"use client";

import { useCallback, useState, useRef } from "react";
import type { Alibi } from "@/lib/casebook";
import * as sfx from "@/lib/sound";
import { narrate, toneForSeat, unlockNarrator } from "@/lib/narrator";

/**
 * Working the room: who has spoken, and what they said.
 *
 * There is no chain here and nothing to await. The accounts are public data dealt to seats
 * by a public function, so a player can open a case, hear all eight of them, and change
 * their mind twice without a wallet, a signature or a gas estimate. The one transaction in
 * this game happens when they put money on a name, and it lives in `Stake`.
 */
export function useCase({ alibis }: { alibis: Alibi[] }) {
  const n = alibis.length;

  const [spoken, setSpoken] = useState<number[]>([]);
  const [witness, setWitness] = useState<number | null>(null);
  const [saying, setSaying] = useState<{ seat: number; line: string } | null>(null);
  /** Which utterance is current, so a finished one cannot silence the next speaker. */
  const speechToken = useRef(0);

  /**
   * Walk up to one of them. That is the whole interaction.
   *
   * Repeatable, unlike the version this replaces: hearing a man out used to cost a
   * transaction, so it had to be rationed to once each. It costs nothing now, and a player
   * comparing two stories should not have to hold one of them in their head.
   */
  const interrogate = useCallback(
    (seat: number) => {
      const line = alibis[seat]?.text;
      if (line === undefined) return;

      unlockNarrator();
      sfx.startRoomTone();
      sfx.knock(0.9 + (seat % 3) * 0.08);
      sfx.whoosh(); // rides under the camera push-in

      setWitness(seat);
      setSpoken((v) => (v.includes(seat) ? v : [...v, seat]));
      setSaying({ seat, line });
      sfx.pluck(300 + seat * 22);

      // Close his mouth when he stops talking.
      //
      // `saying` is what drives the talking expression, and nothing used to clear it, so a
      // suspect went on flapping his jaw for the rest of the case. `narrate` resolves when
      // the utterance ends, so that is the moment to put the face back. The token guards
      // against a stale utterance landing after the player has moved on to somebody else.
      const token = ++speechToken.current;
      void narrate(line, { ...toneForSeat(seat), seat }).then(() => {
        if (speechToken.current === token) setSaying(null);
      });
    },
    [alibis],
  );

  return {
    n,
    witness,
    spoken,
    saying,
    allSpoken: spoken.length === n,
    interrogate,
  };
}
