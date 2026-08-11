"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classifyQuestion,
  fullMask,
  questionCost,
  toggleSeat,
  type CaseConfig,
  type Phase,
  type Testimony,
} from "@/lib/case";
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
  oracle: Oracle;
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
  const cost = mask === 0 ? 0 : questionCost(mask, n);
  const canAsk = !over && !busy && ready && witness !== null && mask !== 0 && cost <= focusLeft;
  const kind = witness !== null && mask !== 0 ? classifyQuestion(mask, witness, n) : null;

  const toggle = useCallback(
    (seat: number) => {
      if (over || busy) return;
      unlockNarrator();
      sfx.tick(180 + seat * 9, 0.04, 0.035);
      setMask((m) => toggleSeat(m, seat));
    },
    [over, busy],
  );

  const chooseWitness = useCallback(
    (seat: number) => {
      if (over || busy) return;
      unlockNarrator();
      sfx.tick(320, 0.05, 0.045);
      setWitness((w) => (w === seat ? null : seat));
    },
    [over, busy],
  );

  const askAll = useCallback(() => setMask(fullMask(n)), [n]);
  const askSelf = useCallback(() => {
    if (witness !== null) setMask(1 << witness);
  }, [witness]);
  const clear = useCallback(() => setMask(0), []);

  async function ask() {
    if (!canAsk || witness === null) return;
    setBusy(true);
    setError(null);
    setSaying(null);
    drone.current = sfx.drone();

    try {
      const result = await atLeast(oracle.ask(witness, mask, setPhase), 900);
      drone.current?.resolve();
      drone.current = null;

      const turn = testimony.length;
      setTestimony((t) => [...t, { id: t.length, witness, mask, cost: result.cost, answer: result.answer }]);
      setFocusLeft((f) => f - result.cost);
      if (result.turnedWitness !== null) {
        setTurned((t) => [...t, result.turnedWitness!]);
        sfx.scratch();
      }

      const line = replyLine(result.answer, witness, turn);
      setSaying({ seat: witness, line, answer: result.answer });
      void narrate(line, { rate: 0.95, pitch: result.answer ? 0.9 : 0.78 });
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
    if (over || busy || !ready) return;
    setBusy(true);
    setError(null);
    setAccused(seat);
    setSaying(null);
    drone.current = sfx.drone();

    try {
      const { correct, truth: layout } = await atLeast(oracle.accuse(seat, setPhase), 1200);
      drone.current?.resolve();
      drone.current = null;
      setTruth({ killer: layout.killer, liars: layout.liars });
      setOutcome(correct ? "solved" : "missed");
      sfx.stamp();
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
    cost,
    canAsk,
    kind,
    toggle,
    chooseWitness,
    askAll,
    askSelf,
    clear,
    ask,
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
