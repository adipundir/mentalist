"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseConfig, Phase, Testimony } from "@/lib/case";
import { deduce } from "@/lib/solver";
import { atLeast, type Oracle } from "@/lib/oracle";
import * as sfx from "@/lib/sound";
import { narrate, unlockNarrator } from "@/lib/narrator";

/**
 * All of the game's rules and state, independent of how it is drawn.
 *
 * Extracted so the room scene and any other presentation share one implementation, * two copies of "what does a control question cost" is exactly how a game ends up with a
 * UI that disagrees with itself.
 */
export function useCase({
  config,
  oracle,
  names,
  alibis,
  beforeHearing,
  onResolved,
}: {
  config: CaseConfig;
  oracle: Oracle | null;
  /** Suspect surnames, in seat order. */
  names: string[];
  /** Every account this case can produce, in written order. The impossible one is last. */
  alibis: { text: string; impossible?: true }[];
  /**
   * Runs between dealing the case and opening the room.
   *
   * This is where the market claims the seat, and it has to be here: a seat can only be
   * taken while the room is still shut, so nobody can read a room, dislike it, and go
   * looking for an easier one to put money on.
   */
  beforeHearing?: (caseId: number) => Promise<void>;
  onResolved?: (solved: boolean) => void;
}) {
  const n = config.suspects;

  const [testimony, setTestimony] = useState<Testimony[]>([]);
  const [turned, setTurned] = useState<number[]>([]);
  const [witness, setWitness] = useState<number | null>(null);
  const [mask, setMask] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [outcome, setOutcome] = useState<"playing" | "solved" | "missed">("playing");
  const [truth, setTruth] = useState<{ killer: number; liars: boolean[] } | null>(null);
  const [accused, setAccused] = useState<number | null>(null);
  const [saying, setSaying] = useState<{ seat: number; line: string; answer: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const drone = useRef<sfx.Drone | null>(null);

  // Dealing a case is a real transaction, so it waits for the player to actually commit.
  // Connecting a wallet is not consent to spend from it: an earlier version opened the case
  // the instant the oracle existed, which put a signature prompt in front of anyone who
  // merely connected to look around.
  const [started, setStarted] = useState(false);
  /** Set when the case was already dealt elsewhere, so opening it again would be a second bill. */
  const [adopted, setAdopted] = useState(false);
  const [spoken, setSpoken] = useState<number[]>([]);
  /** seat -> which written account that man gives. Empty until the room is opened. */
  const [slots, setSlots] = useState<number[]>([]);

  const start = useCallback(
    (already?: boolean) => {
      if (!oracle) return;
      if (already) setAdopted(true);
      setStarted(true);
    },
    [oracle],
  );

  useEffect(() => {
    if (!oracle || !started) return;
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        if (!adopted) await oracle.open(config, 0);
        const id = (oracle as { caseId?: () => number | null }).caseId?.();
        if (beforeHearing && id != null) await beforeHearing(id);
        const heard = await oracle.hearRoom(setPhase);
        if (cancelled) return;
        setSlots(heard);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(inCharacter(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracle, config, started, adopted]);

  const deductions = useMemo(
    () => deduce(n, config.liars, testimony, turned),
    [n, config.liars, testimony, turned],
  );

  const over = outcome !== "playing";

  /**
   * Question one suspect. That is the whole interaction.
   *
   * Each of them has exactly one thing to say and they always say it about the same people,
   * so there is nothing to assemble and nothing to spend. You walk up, they talk, and what
   * you do with it is your problem. Everyone gets asked once.
   */
  const interrogate = useCallback(
    (seat: number) => {
      if (over || busy || !ready || spoken.includes(seat)) return;
      const slot = slots[seat];
      if (slot === undefined) return;

      unlockNarrator();
      sfx.startRoomTone();
      sfx.knock(0.9 + (seat % 3) * 0.08);
      sfx.whoosh(); // rides under the camera push-in

      // No transaction and no signature. The whole room was granted to this wallet when it
      // was opened, so hearing a man out is just reading what we already hold.
      const line = alibis[slot]?.text ?? "";
      setWitness(seat);
      setSpoken((v) => [...v, seat]);
      setSaying({ seat, line, answer: false });
      void narrate(line, { rate: 0.96, pitch: 0.97 });
      sfx.pluck(300 + seat * 22);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [over, busy, ready, spoken, slots, alibis],
  );


  async function accuse(seat: number) {
    if (!oracle || over || busy || !ready) return;
    setBusy(true);
    setError(null);
    setAccused(seat);
    setSaying(null);
    sfx.stabAccuse();
    drone.current = sfx.drone();

    try {
      const { correct, truth: layout } = await atLeast(oracle.accuse(seat, setPhase), 1200);
      drone.current?.resolve();
      drone.current = null;
      setTruth({ killer: layout.killer, liars: layout.liars });
      setOutcome(correct ? "solved" : "missed");
      // The unmasking is the biggest sound in the game and it happens once per case.
      if (correct) {
        sfx.stingUnmask();
        setTimeout(() => sfx.stingSolved(), 900);
      } else {
        sfx.stingMissed();
      }
      setTimeout(() => sfx.stamp(), 260);
      if (onResolved) setTimeout(() => onResolved(correct), 3000);
    } catch (e) {
      drone.current?.stop();
      drone.current = null;
      setAccused(null);
      setError(inCharacter(e));
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  }

  return {
    n,
    testimony,
    turned,
    witness,
    mask,
    phase,
    busy,
    ready,
    outcome,
    over,
    truth,
    accused,
    saying,
    error,
    deductions,
    started,
    start,
    spoken,
    slots,
    allSpoken: spoken.length === n,
    interrogate,
    accuse,
    dismissSaying: () => setSaying(null),
  };
}

/**
 * Judges hit error paths constantly on hackathon builds. Being the one team whose failure
 * states stay in fiction is disproportionately memorable, and it never hides what happened.
 */
export function inCharacter(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/user rejected|denied|rejected the request/i.test(msg))
    return "YOU THOUGHT BETTER OF IT. THE FILE STAYS SHUT.";
  if (/insufficient funds/i.test(msg)) return "THE BUREAU WON'T COVER IT. YOU NEED BASE SEPOLIA ETH.";
  if (/NoFocusLeft/i.test(msg)) return "YOU'RE OUT OF FOCUS. NAME SOMEONE.";
  if (/NotYourCase/i.test(msg)) return "THAT FILE ISN'T YOURS.";
  if (/reverted|execution/i.test(msg)) return "THE REGISTRY REFUSED YOUR FILING.";
  if (/timeout|network|fetch/i.test(msg)) return "THE LINE WENT DEAD. TRY AGAIN.";
  return msg.slice(0, 120).toUpperCase();
}
