"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseConfig, Phase, Testimony } from "@/lib/case";
import { deduce } from "@/lib/solver";
import { atLeast, type Oracle } from "@/lib/oracle";
import { statement } from "@/lib/script";
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
  onResolved,
}: {
  config: CaseConfig;
  oracle: Oracle | null;
  /** Suspect surnames, in seat order, so a statement can name who it is about. */
  names: string[];
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
    if (adopted) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    oracle
      .open(config, 0)
      .then(() => !cancelled && setReady(true))
      .catch((e) => !cancelled && setError(inCharacter(e)));
    return () => {
      cancelled = true;
    };
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
      if (!oracle || over || busy || !started || spoken.includes(seat)) return;
      unlockNarrator();
      sfx.startRoomTone();
      sfx.knock(0.9 + (seat % 3) * 0.08);
      sfx.whoosh(); // rides under the camera push-in
      setWitness(seat);
      void fire(seat, config.claims[seat]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oracle, over, busy, started, spoken, config.claims],
  );

  async function fire(seat: number, m: number) {
    if (!oracle) return;
    setMask(m);
    setBusy(true);
    setError(null);
    setSaying(null);
    sfx.switchClick();
    drone.current = sfx.drone();

    try {
      const result = await atLeast(oracle.ask(seat, m, setPhase), 900);
      drone.current?.resolve();
      drone.current = null;

      const turn = testimony.length;
      setTestimony((t) => [...t, { id: t.length, witness: seat, mask: m, cost: result.cost, answer: result.answer }]);
      setSpoken((v) => [...v, seat]);

      // The stab is the loud moment; it fires on the answer, never on navigation.
      if (result.answer) sfx.stabYes();
      else sfx.stabNo();

      const about = names.filter((_, i) => ((m >> i) & 1) === 1);
      const line = statement(result.answer, about, seat, turn);
      setSaying({ seat, line, answer: result.answer });
      void narrate(line, { rate: 0.95, pitch: result.answer ? 1.0 : 0.92 });
      setWitness(null);
    } catch (e) {
      drone.current?.stop();
      drone.current = null;
      // Let go of the room. Leaving the camera pushed in on a suspect who never answered
      // reads as though the question is still in flight.
      setWitness(null);
      setMask(0);
      setError(inCharacter(e));
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  }

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
