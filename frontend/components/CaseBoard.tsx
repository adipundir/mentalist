"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CONTROL_COST,
  QUESTION_COST,
  classifyQuestion,
  fullMask,
  inMask,
  maskSeats,
  popcount,
  questionCost,
  toggleSeat,
  type CaseConfig,
  type Phase,
  type Testimony,
} from "@/lib/case";
import { deduce } from "@/lib/solver";
import { caseNumber, caseTitle, generateSuspects } from "@/lib/suspects";
import { atLeast, type Oracle } from "@/lib/oracle";
import * as sfx from "@/lib/sound";
import { Dossier, type SeatVerdict } from "./Dossier";
import { Transcript } from "./Transcript";
import { PhaseBanner } from "./PhaseBanner";
import { Verdict } from "./Verdict";

interface Props {
  config: CaseConfig;
  oracle: Oracle;
  seed: number;
  /** Rendered under the board — the on-chain mode puts its Basescan line here. */
  chainStatus?: React.ReactNode;
  /** Play the case on its own, for the zero-click door. */
  autoPlay?: boolean;
  onSolved?: (focusLeft: number, questions: number) => void;
  onNewCase?: () => void;
}

export function CaseBoard({ config, oracle, seed, chainStatus, autoPlay, onSolved, onNewCase }: Props) {
  const n = config.suspects;
  const suspects = useMemo(() => generateSuspects(n, seed), [n, seed]);

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
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const droneRef = useRef<sfx.Drone | null>(null);

  // Deal the case once on mount.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    oracle
      .open(config, seed)
      .then(() => !cancelled && setReady(true))
      .catch((e) => !cancelled && setError(inCharacter(e)));
    return () => {
      cancelled = true;
    };
  }, [oracle, config, seed]);

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
      sfx.tick(180 + seat * 9, 0.04, 0.035);
      setMask((m) => toggleSeat(m, seat));
    },
    [over, busy],
  );

  const chooseWitness = useCallback(
    (seat: number) => {
      if (over || busy) return;
      sfx.tick(320, 0.05, 0.045);
      setWitness((w) => (w === seat ? null : seat));
    },
    [over, busy],
  );

  async function ask() {
    if (!canAsk || witness === null) return;
    setBusy(true);
    setError(null);
    droneRef.current = sfx.drone();

    try {
      // Floor the beat: a verdict that appears instantly reads as fake, the same verdict
      // staged over a beat reads as adjudicated.
      const result = await atLeast(oracle.ask(witness, mask, setPhase), 900);

      droneRef.current?.resolve();
      droneRef.current = null;

      setTestimony((t) => [
        ...t,
        { id: t.length, witness, mask, cost: result.cost, answer: result.answer },
      ]);
      setFocusLeft((f) => f - result.cost);
      if (result.turnedWitness !== null) {
        setTurned((t) => [...t, result.turnedWitness!]);
        sfx.scratch();
      }
      setMask(0);
    } catch (e) {
      droneRef.current?.stop();
      droneRef.current = null;
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
    droneRef.current = sfx.drone();

    try {
      const { correct, truth: layout } = await atLeast(oracle.accuse(seat, setPhase), 1200);
      droneRef.current?.resolve();
      droneRef.current = null;
      setTruth({ killer: layout.killer, liars: layout.liars });
      setOutcome(correct ? "solved" : "missed");
      sfx.stamp();
      if (correct) onSolved?.(focusLeft, testimony.length);
    } catch (e) {
      droneRef.current?.stop();
      droneRef.current = null;
      setAccused(null);
      setError(inCharacter(e));
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  }

  /**
   * The zero-click door. Plays the documented winning line — control question first, then
   * binary splits over whatever is still live — using the same Notebook a human sees. It
   * deliberately plays *well but not instantly*, pausing on each move so a viewer can read
   * what happened before the next one lands.
   *
   * It cheats at nothing: it only ever reads `deductions`, which is derived from answers
   * the player legitimately holds.
   */
  const autoRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || !ready || over || autoRef.current) return;
    autoRef.current = true;

    let cancelled = false;
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      // 1. Establish a witness we can trust — or trust in reverse.
      let trusted = 0;
      let honest = true;
      {
        const control = fullMask(n);
        setWitness(trusted);
        await pause(700);
        setMask(control);
        await pause(700);
        const r = await oracle.ask(trusted, control, setPhase);
        if (cancelled) return;
        setTestimony((t) => [...t, { id: t.length, witness: trusted, mask: control, cost: r.cost, answer: r.answer }]);
        setFocusLeft((f) => f - r.cost);
        setMask(0);
        honest = r.answer; // control question: answer === NOT(this witness lies)
      }

      // 2. Split until one name is left.
      let live = Array.from({ length: n }, (_, i) => i);
      let asked: Testimony[] = [];
      while (live.length > 1 && !cancelled) {
        const half = live.slice(0, Math.floor(live.length / 2));
        const mask = half.reduce((m, s) => m | (1 << s), 0);

        await pause(900);
        setMask(mask);
        await pause(700);

        const r = await oracle.ask(trusted, mask, setPhase);
        if (cancelled) return;
        asked = [...asked, { id: asked.length, witness: trusted, mask, cost: r.cost, answer: r.answer }];
        setTestimony((t) => [...t, { id: t.length, witness: trusted, mask, cost: r.cost, answer: r.answer }]);
        setFocusLeft((f) => f - r.cost);
        setMask(0);

        const inHalf = honest ? r.answer : !r.answer;
        live = inHalf ? half : live.filter((s) => !half.includes(s));
      }

      // 3. Name them.
      if (cancelled || live.length !== 1) return;
      await pause(1100);
      setBusy(true);
      setAccused(live[0]);
      const drone = sfx.drone();
      const { correct, truth: layout } = await atLeast(oracle.accuse(live[0], setPhase), 1200);
      drone.resolve();
      if (cancelled) return;
      setTruth({ killer: layout.killer, liars: layout.liars });
      setOutcome(correct ? "solved" : "missed");
      sfx.stamp();
      setBusy(false);
      setPhase("idle");
    })().catch(() => {
      setBusy(false);
      setPhase("idle");
    });

    return () => {
      cancelled = true;
    };
  }, [autoPlay, ready, over, oracle, n]);

  function verdictFor(seat: number): SeatVerdict {
    if (truth) return seat === truth.killer ? "tyger" : "cleared";
    if (accused === seat) return "accused";
    return deductions.candidates.includes(seat) ? "live" : "cleared";
  }

  const honesty = truth
    ? (truth.liars.map((l) => (l ? "liar" : "honest")) as ("liar" | "honest" | "unknown")[])
    : deductions.honesty;

  const control = fullMask(n);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-6 sm:px-6">
      {/* ── case header ── */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-ink-3 pb-4">
        <div>
          <p className="font-mono text-[10px] tracking-file text-bone-dim">
            CASE {caseNumber(seed)} · {config.label.toUpperCase()}
          </p>
          <h1 className="font-type text-[26px] leading-tight text-bone sm:text-[32px]">
            {caseTitle(seed)}
          </h1>
          <p className="max-w-xl font-body text-[13px] italic text-bone-dim">{config.blurb}</p>
        </div>

        <div className="flex items-end gap-5">
          <Meter label="FOCUS" value={focusLeft} total={config.focus} />
          <div className="text-right">
            <p className="font-mono text-[10px] tracking-file text-bone-dim">STILL POSSIBLE</p>
            <p
              className={[
                "font-type text-[28px] leading-none",
                deductions.candidates.length === 1 ? "text-blood-hot" : "text-bone",
              ].join(" ")}
            >
              {deductions.candidates.length}
              <span className="text-[14px] text-bone-dim">/{n}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMutedState(next);
              sfx.setMuted(next);
            }}
            className="cursor-pointer border border-ink-3 px-2 py-1 font-mono text-[9px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
        </div>
      </header>

      {/* the case file states its own parameters — this is information the player owns */}
      <p className="mb-4 font-body text-[12px] text-bone-dim">
        <span className="text-bone">{config.liars}</span> of these {n} habitually lie
        {config.turnAt > 0 && (
          <>
            {" "}
            · the Tyger reaches a witness after your{" "}
            <span className="text-blood-hot">{ordinal(config.turnAt)}</span> read
          </>
        )}{" "}
        · and whoever the Tyger is, <span className="text-blood-hot">he always lies</span>.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── the lineup ── */}
        <section>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {suspects.map((s, i) => (
              <Dossier
                key={s.seat}
                index={i}
                suspect={s}
                inQuestion={inMask(mask, s.seat)}
                isWitness={witness === s.seat}
                verdict={verdictFor(s.seat)}
                honesty={honesty[s.seat]}
                odds={truth ? (s.seat === truth.killer ? 1 : 0) : deductions.killerOdds[s.seat]}
                turned={turned.includes(s.seat)}
                disabled={over || busy || !ready}
                onToggle={() => toggle(s.seat)}
                onWitness={() => chooseWitness(s.seat)}
              />
            ))}
          </div>

          {chainStatus && <div className="mt-4">{chainStatus}</div>}
        </section>

        {/* ── notebook ── */}
        <aside className="flex flex-col gap-5">
          <div className="paper border border-ink-3 p-4">
            <Transcript
              testimony={testimony}
              suspects={suspects}
              honesty={honesty}
              turned={turned}
            />
          </div>

          {!over && (
            <div className="paper border border-ink-3 p-4">
              <h2 className="mb-2 border-b border-ink-3 pb-2 font-mono text-[10px] tracking-file text-bone-dim">
                THE THREE QUESTIONS
              </h2>
              <dl className="space-y-2 font-body text-[12px] leading-snug text-bone-dim">
                <Hint
                  term="CONTROL"
                  cost={CONTROL_COST}
                  active={kind === "control"}
                  onUse={() => {
                    setMask(control);
                    sfx.tick(260, 0.05, 0.04);
                  }}
                  disabled={over || busy}
                >
                  Ask about <em>everyone</em>. The Tyger is always in that set, so the answer is
                  purely whether this witness lies. A question you already know the answer to.
                </Hint>
                <Hint
                  term="SELF"
                  cost={QUESTION_COST}
                  active={kind === "self"}
                  onUse={() => {
                    if (witness !== null) {
                      setMask(1 << witness);
                      sfx.tick(240, 0.05, 0.04);
                    }
                  }}
                  disabled={over || busy || witness === null}
                >
                  &ldquo;Are <em>you</em> the Tyger?&rdquo; A <span className="text-blood-hot">yes</span>{" "}
                  can only come from an innocent who lies — it exposes them and clears them at once.
                </Hint>
                <Hint term="SPLIT" cost={QUESTION_COST} active={kind === "split"} disabled>
                  Mark about half the board. Worth a full bit — but only once you know whether to
                  believe the witness.
                </Hint>
              </dl>
            </div>
          )}
        </aside>
      </div>

      {/* ── the interrogation bar ── */}
      <AnimatePresence>
        {!over && (
          <motion.div
            initial={{ y: 90 }}
            animate={{ y: 0 }}
            exit={{ y: 90 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-3 bg-ink/95 backdrop-blur"
          >
            <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                {witness === null ? (
                  <p className="font-body text-[13px] italic text-bone-dim">
                    Choose a witness — press <span className="font-mono text-[11px]">ASK</span> on
                    their dossier.
                  </p>
                ) : (
                  <p className="truncate font-body text-[13px] text-bone">
                    <span className="font-type">{suspects[witness].name}</span>
                    <span className="text-bone-dim">
                      {" "}
                      — &ldquo;is the Tyger one of{" "}
                      {mask === 0 ? (
                        <em className="text-bone-dim/60">…mark them on the board</em>
                      ) : mask === control ? (
                        <span className="text-brass">all {n}</span>
                      ) : (
                        <span className="text-bone">
                          {maskSeats(mask, n)
                            .map((s) => s + 1)
                            .join(", ")}
                        </span>
                      )}
                      ?&rdquo;
                    </span>
                  </p>
                )}
                {phase !== "idle" && <PhaseBanner phase={phase} />}
                {error && (
                  <p className="shake mt-1 font-mono text-[10px] tracking-file text-blood-hot">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {mask !== 0 && (
                  <span className="font-mono text-[10px] tracking-file text-bone-dim">
                    {popcount(mask)} MARKED · COST {cost}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setMask(0)}
                  disabled={mask === 0 || busy}
                  className="cursor-pointer border border-ink-3 px-3 py-2 font-mono text-[10px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone disabled:cursor-not-allowed disabled:opacity-30"
                >
                  CLEAR
                </button>
                <button
                  type="button"
                  onClick={ask}
                  disabled={!canAsk}
                  className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2 font-mono text-[10px] tracking-file text-blood-hot transition-colors hover:bg-blood-hot/25 disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-transparent disabled:text-bone-dim/40"
                >
                  {busy ? "…" : "PUT IT TO THEM"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const only = deductions.candidates.length === 1 ? deductions.candidates[0] : null;
                    const target = only ?? (mask !== 0 && popcount(mask) === 1 ? maskSeats(mask, n)[0] : null);
                    if (target !== null) void accuse(target);
                  }}
                  disabled={
                    busy ||
                    !ready ||
                    (deductions.candidates.length !== 1 && popcount(mask) !== 1)
                  }
                  title="Name the Tyger. Mark exactly one suspect, or narrow the board to one."
                  className="cursor-pointer border border-brass px-4 py-2 font-mono text-[10px] tracking-file text-brass transition-colors hover:bg-brass/15 disabled:cursor-not-allowed disabled:border-ink-3 disabled:text-bone-dim/40"
                >
                  NAME THEM
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {over && truth && (
          <Verdict
            solved={outcome === "solved"}
            suspects={suspects}
            truth={truth}
            accused={accused}
            focusLeft={focusLeft}
            questions={testimony.length}
            seed={seed}
            config={config}
            onNewCase={onNewCase}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── small pieces ────────────────────────────────────────────

function Meter({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-file text-bone-dim">{label}</p>
      <div className="mt-1 flex gap-1" aria-label={`${value} of ${total} ${label} remaining`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={[
              "h-5 w-[7px] border",
              i < value ? "border-blood-hot bg-blood-hot/70" : "border-ink-3 bg-transparent",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}

function Hint({
  term,
  cost,
  children,
  active,
  onUse,
  disabled,
}: {
  term: string;
  cost: number;
  children: React.ReactNode;
  active?: boolean;
  onUse?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={active ? "border-l-2 border-blood-hot pl-2" : "border-l-2 border-transparent pl-2"}>
      <dt className="flex items-baseline gap-2">
        <button
          type="button"
          onClick={onUse}
          disabled={disabled || !onUse}
          className={[
            "font-mono text-[10px] tracking-file",
            onUse && !disabled
              ? "cursor-pointer text-brass hover:text-blood-hot"
              : "cursor-default text-bone-dim",
          ].join(" ")}
        >
          {term}
        </button>
        <span className="font-mono text-[9px] text-bone-dim/50">{cost} FOCUS</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

const ordinal = (n: number) => ["zeroth", "first", "second", "third", "fourth", "fifth"][n] ?? `${n}th`;

/**
 * Judges hit error paths constantly on hackathon builds. Being the one team whose failure
 * states stay in fiction is disproportionately memorable — and it never hides what happened.
 */
function inCharacter(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/user rejected|denied|rejected the request/i.test(msg))
    return "YOU THOUGHT BETTER OF IT. THE FILE STAYS SHUT.";
  if (/insufficient funds/i.test(msg))
    return "THE BUREAU WON'T COVER IT. YOU NEED BASE SEPOLIA ETH.";
  if (/NoFocusLeft/i.test(msg)) return "YOU'RE OUT OF FOCUS. NAME SOMEONE.";
  if (/NotYourCase/i.test(msg)) return "THAT FILE ISN'T YOURS.";
  if (/reverted|execution/i.test(msg)) return "THE REGISTRY REFUSED YOUR FILING.";
  if (/timeout|network|fetch/i.test(msg)) return "THE LINE WENT DEAD. TRY AGAIN.";
  return msg.slice(0, 120).toUpperCase();
}
