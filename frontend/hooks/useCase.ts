"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTROL_COST, fullMask, type CaseConfig, type Phase, type Testimony } from "@/lib/case";
import { deduce } from "@/lib/solver";
import { atLeast, type Oracle } from "@/lib/oracle";
import { replyLine } from "@/lib/script";
import * as sfx from "@/lib/sound";
import { narrate, unlockNarrator } from "@/lib/narrator";

/**
 * All of the game's rules and state, independent of how it is drawn.
 *
 * Extracted so the room scene and any other presentation share one implementation —
 * two copies of "what does a control question cost" is exactly how a game ends up with a
 * UI that disagrees with itself.
 */
export function useCase({
  config,
  oracle,
  onResolved,
}: {
  config: CaseConfig;
  oracle: Oracle | null;
  onResolved?: (solved: boolean, focusLeft: number) => void;
}) {
  const n = config.suspects;

  const [focusLeft, setFocusLeft] = useState(config.focus);
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

  useEffect(() => {
    if (!oracle) return;
    let cancelled = false;
    setReady(false);
    oracle
      .open(config, 0)
      .then(() => !cancelled && setReady(true))
      .catch((e) => !cancelled && setError(inCharacter(e)));
    return () => {
      cancelled = true;
    };
  }, [oracle, config]);

  const deductions = useMemo(
    () => deduce(n, config.liars, testimony, turned),
    [n, config.liars, testimony, turned],
  );

  const over = outcome !== "playing";
  const canAsk = !!oracle && !over && !busy && ready && witness !== null;

  const chooseWitness = useCallback(
    (seat: number) => {
      if (over || busy) return;
      unlockNarrator();
      sfx.startRoomTone();
      setWitness((w) => {
        const next = w === seat ? null : seat;
        if (next !== null) {
          sfx.knock(0.9 + (seat % 3) * 0.08);
          sfx.whoosh(); // rides under the camera push-in
        }
        return next;
      });
    },
    [over, busy],
  );

  /**
   * Ask the chosen witness about one person, and fire immediately.
   *
   * The old flow was: pick a witness, double-click others to assemble a bitmask, then press
   * a third button. That is a query builder, not an interrogation — nobody would guess it,
   * and it buried a mechanic that is genuinely one sentence long. Now it is two clicks:
   * who you are asking, and who you are asking about.
   */
  const askAbout = useCallback(
    (target: number) => {
      if (!oracle || over || busy || witness === null || focusLeft < 1) return;
      void fire(1 << target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [over, busy, witness, focusLeft],
  );

  /** "Is he even in this room?" — always true, so the answer is purely whether they lie. */
  const askRoom = useCallback(
    () => {
      if (!oracle || over || busy || witness === null || focusLeft < CONTROL_COST) return;
      void fire(fullMask(n));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [over, busy, witness, focusLeft, n],
  );

  async function fire(m: number) {
    if (!oracle || witness === null) return;
    setMask(m);
    setBusy(true);
    setError(null);
    setSaying(null);
    sfx.switchClick();
    drone.current = sfx.drone();

    try {
      const result = await atLeast(oracle.ask(witness, m, setPhase), 900);
      drone.current?.resolve();
      drone.current = null;

      const turn = testimony.length;
      setTestimony((t) => [...t, { id: t.length, witness, mask: m, cost: result.cost, answer: result.answer }]);
      setFocusLeft((f) => f - result.cost);
      if (result.turnedWitness !== null) {
        setTurned((t) => [...t, result.turnedWitness!]);
        sfx.scratch();
      }

      // The stab is the loud moment; it fires on the answer, never on navigation.
      if (result.answer) sfx.stabYes();
      else sfx.stabNo();

      const line = replyLine(result.answer, witness, turn);
      setSaying({ seat: witness, line, answer: result.answer });
      void narrate(line, { rate: 0.95, pitch: result.answer ? 1.0 : 0.92 });
      setMask(0);
    } catch (e) {
      drone.current?.stop();
      drone.current = null;
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
      if (onResolved) setTimeout(() => onResolved(correct, focusLeft), 3000);
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
    focusLeft,
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
    canAsk,
    chooseWitness,
    askAbout,
    askRoom,
    accuse,
    dismissSaying: () => setSaying(null),
  };
}

/**
 * Judges hit error paths constantly on hackathon builds. Being the one team whose failure
 * states stay in fiction is disproportionately memorable — and it never hides what happened.
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
