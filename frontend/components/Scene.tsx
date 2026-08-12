"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { maskSeats, popcount, type CaseConfig } from "@/lib/case";
import type { Suspect } from "@/lib/suspects";
import type { Oracle } from "@/lib/oracle";
import { Character, type CharacterSpec, type Expression, type Idle } from "./Character";
import { useCase } from "@/hooks/useCase";
import { Room, type RoomSubject } from "./Room";
import { Dialogue, type Line } from "./Dialogue";
import { Notebook } from "./Notebook";
import { Waiting } from "./Waiting";
import { janeism } from "@/lib/script";
import * as sfx from "@/lib/sound";

/**
 * The game, played in a room.
 *
 * The whole screen is the scene. Everything else, the transcript, the deduction grid, the
 * question builder, is furniture that slides over it, so the suspects are never off screen
 * while you are talking to them.
 */
export type SceneHandle = { begin: (caseId: bigint) => void };

/**
 * The room's behaviour, in the order it is dealt round the lineup.
 *
 * A murder has just happened and these people were in the house. Two of them cannot keep
 * still, one keeps looking at her and away again, one scratches his head at the whole
 * business, and one of them is enjoying it and keeps catching himself. Nobody stands to
 * attention, because nobody stands to attention.
 */
const IDLES: Idle[] = ["scratch", "scared", "glance", "giggle", "shift"];

export function Scene({
  config,
  oracle,
  suspects,
  chapter,
  title,
  nudge,
  closesAt,
  variant = 0,
  connect,
  openedCaseId,
  alibis,
  beforeHearing,
  stakePanel,
  staked = false,
  onResolved,
}: {
  config: CaseConfig;
  /** Null until a wallet is connected, the room still paints, it just can't be played. */
  oracle: Oracle | null;
  suspects: Suspect[];
  chapter?: string;
  title: string;
  nudge?: { name: string; spec: CharacterSpec; line: string } | null;
  /** Unix ms this case stops accepting entries. Drives the clock in the middle of the HUD. */
  closesAt?: number;
  /** Which crime scene this case is set in. */
  variant?: number;
  /** Shown in place of the controls when there is no wallet yet. */
  connect?: React.ReactNode;
  /** The case the market already dealt. Adopting it avoids opening (and paying for) a second. */
  openedCaseId?: bigint | null;
  /** Every account this case can produce, in written order. */
  alibis: { text: string; impossible?: true }[];
  /** Claims the market seat between dealing the case and opening the room. */
  beforeHearing?: (caseId: number) => Promise<void>;
  /** Shown once the whole room has spoken, so the stake is placed on an informed read. */
  stakePanel?: React.ReactNode;
  /** True once the stake is down and the player may name someone. */
  staked?: boolean;
  onResolved?: (solved: boolean) => void;
}) {
  const g = useCase({
    config,
    oracle,
    names: useMemo(() => suspects.map((s) => lastName(s.name)), [suspects]),
    alibis,
    beforeHearing,
    onResolved,
  });
  const [notebook, setNotebook] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [line, setLine] = useState<Line | null>(null);

  // The market deals the case as part of taking the stake, so the room picks up the one
  // that already exists rather than opening another.
  useEffect(() => {
    if (openedCaseId == null || !oracle) return;
    (oracle as { adopt?: (id: bigint) => void }).adopt?.(openedCaseId);
    g.start(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedCaseId, oracle]);

  // Open on the room, then a beat of narration so the player reads the space before the
  // interface arrives.
  useEffect(() => {
    if (!g.ready) return;
    setLine({
      text:
        `Every one of these ${g.n} knows exactly who did it. ` +
        `${config.liars === 1 ? "One of them will lie to protect him" : `${config.liars} of them will lie to protect him`}` +
        `, and so will he.`,
      tone: "narrator",
    });
    const id = setTimeout(() => setLine(null), 5200);
    return () => clearTimeout(id);
  }, [g.ready, config.liars, g.n]);

  // A newly proven liar gets a plucked string, the "tell". Tracked so it fires once per
  // suspect rather than on every re-render that recomputes the same deduction.
  const flagged = useRef(new Set<number>());
  useEffect(() => {
    g.deductions.honesty.forEach((h, i) => {
      if (h === "liar" && !flagged.current.has(i)) {
        flagged.current.add(i);
        sfx.pluck(300 + i * 24);
      }
    });
  }, [g.deductions.honesty]);

  // Notebook: paper.
  useEffect(() => {
    if (notebook) sfx.paper();
  }, [notebook]);

  // Room tone runs for the life of the scene.
  useEffect(() => {
    sfx.startRoomTone();
    return () => sfx.stopRoomTone();
  }, []);

  // Testimony takes over the bar the moment it lands.
  useEffect(() => {
    if (!g.saying) return;
    const s = suspects[g.saying.seat];
    setLine({
      speaker: { name: s.name, role: s.role, spec: s.character },
      text: g.saying.line,
      answer: g.saying.answer,
    });
  }, [g.saying, suspects]);

  const subjects: RoomSubject[] = useMemo(
    () =>
      suspects.map((s, i) => {
        const isKiller = g.truth ? i === g.truth.killer : false;
        const honesty = g.truth
          ? g.truth.liars[i]
            ? "liar"
            : "honest"
          : g.deductions.honesty[i];

        // What they do while nobody is asking them anything. Fixed per seat rather than
        // random, so a man who scratches his head keeps doing it and the room has faces you
        // start to recognise. Spread across the lineup so no two neighbours match.
        const idle: Idle = IDLES[i % IDLES.length]!;

        let expression: Expression = "neutral";
        if (g.truth) expression = isKiller ? "sinister" : "neutral";
        else if (g.saying?.seat === i) expression = "talking";
        else if (g.busy && g.witness === i) expression = "shifty";
        else if (honesty === "liar") expression = "caught";
        else if (g.witness === i) expression = "nervous";
        // Idle behaviour drives the resting face too, or a man shaking with fear stares
        // blankly out at you while he does it.
        else if (idle === "scared") expression = "nervous";
        else if (idle === "giggle") expression = "smug";
        else if (idle === "glance") expression = "shifty";

        return {
          suspect: s,
          expression,
          cleared: g.truth ? !isKiller : !g.deductions.candidates.includes(i),
          liar: honesty === "liar",
          honest: honesty === "honest",
          inQuestion: ((g.mask >> i) & 1) === 1,
          turned: g.turned.includes(i),
          idle: g.truth || g.saying?.seat === i ? "still" : idle,
          saying: g.saying?.seat === i ? { line: g.saying.line, answer: g.saying.answer } : null,
        };
      }),
    [suspects, g.truth, g.deductions, g.saying, g.busy, g.witness, g.mask, g.turned],
  );

  // You may name anyone once you have picked them. If the evidence has already narrowed to
  // a single man, he is offered by default so the obvious case does not need an extra click.
  const only = g.deductions.candidates.length === 1 ? g.deductions.candidates[0] : null;
  const nameable = chosen ?? only;

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* ── the room is the page: one background, edge to edge ── */}
      <div className="absolute inset-0">
        <Room
          subjects={subjects}
          focused={g.witness ?? chosen}
          onFocus={(seat) => (g.allSpoken ? setChosen(seat) : g.interrogate(seat))}
          onToggle={(seat) => (g.allSpoken ? setChosen(seat) : g.interrogate(seat))}
          disabled={g.over || g.busy || !g.ready || !g.started}
          variant={variant}
        />

        {/* HUD: which case this is, and how long it stands. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-4 pb-12 pt-14 sm:px-7 sm:pt-16"
          style={{ background: "linear-gradient(rgb(6 5 7 / 0.92), rgb(6 5 7 / 0.55) 55%, transparent)" }}
        >
          <div>
            {chapter && (
              <p className="font-mono text-[10px] tracking-file text-blood-hot">{chapter}</p>
            )}
            <h1 className="font-type text-[22px] leading-tight text-bone drop-shadow sm:text-[28px]">
              {title}
            </h1>
          </div>

          {closesAt !== undefined && <Countdown closesAt={closesAt} />}

          <div className="text-right">
            <p className="font-mono text-[10px] tracking-file text-bone-dim">SPOKEN TO</p>
            <p className="font-type text-[26px] leading-none text-bone">
              {g.spoken.length}
              <span className="text-[14px] text-bone-dim">/{g.n}</span>
            </p>
          </div>
        </div>

        {/* the team, leaning in */}
        {nudge && !g.over && !line && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="pointer-events-none absolute bottom-32 left-4 flex max-w-[300px] items-end gap-2 sm:left-7"
          >
            <div className="w-14 shrink-0 border border-ink-3 bg-ink">
              <Character spec={nudge.spec} expression="talking" className="h-16 w-full" />
            </div>
            <div className="border border-ink-3 bg-ink px-2.5 py-2">
              <p className="font-mono text-[9px] tracking-file text-brass">
                {nudge.name.toUpperCase()}
              </p>
              <p className="font-body text-[12px] leading-snug text-bone">
                &ldquo;{nudge.line}&rdquo;
              </p>
            </div>
          </motion.div>
        )}

        <Dialogue line={line} />
      </div>

      {/* ── one instruction, always telling you the next click ── */}
      <div
        className="absolute inset-x-0 bottom-0 px-4 pb-16 pt-12 sm:px-7"
        style={{ background: "linear-gradient(transparent, rgb(8 7 9 / 0.88) 45%)" }}
      >
        {connect ? (
          <div className="flex flex-wrap items-center justify-center gap-4 py-1">{connect}</div>
        ) : g.allSpoken && !staked && stakePanel ? (
          <div className="py-1">{stakePanel}</div>
        ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 font-body text-[15px] leading-snug text-bone">
            {!g.started ? (
              <>
                They&rsquo;re in the room and they&rsquo;re waiting.{" "}
                <span className="text-blood-hot">Open the case when you&rsquo;re ready.</span>
              </>
            ) : g.busy ? (
              <Waiting phase={g.phase} />
            ) : g.witness === null ? (
              <>
                <span className="text-blood-hot">Click anyone</span> to question them.
              </>
            ) : (
              <>
                Asking <span className="font-type text-bone">{suspects[g.witness].name}</span>
                {", "}
                <span className="text-blood-hot">click who you want to ask about.</span>
                <span className="ml-2 text-bone-dim">
                  (Click {lastName(suspects[g.witness].name)} again to ask about himself.)
                </span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!g.started ? (
              <Act onClick={() => g.start()} tone="blood">
                OPEN THE CASE
              </Act>
            ) : (
              <>
                <Act onClick={() => setNotebook(true)}>WHAT I KNOW</Act>
                <Act
                  onClick={() => nameable !== null && void g.accuse(nameable)}
                  disabled={g.busy || !g.ready || nameable === null || g.over || (!!stakePanel && !staked)}
                  tone="blood"
                >
                  {nameable !== null
                    ? `NAME ${lastName(suspects[nameable].name).toUpperCase()}`
                    : "NAME HIM"}
                </Act>
              </>
            )}
          </div>
        </div>
        )}

        {g.error && (
          <p className="shake mt-1 font-mono text-[10px] tracking-file text-blood-hot">{g.error}</p>
        )}
      </div>

      <AnimatePresence>
        {notebook && (
          <Notebook
            suspects={suspects}
            testimony={g.testimony}
            honesty={g.truth ? g.truth.liars.map((l) => (l ? "liar" : "honest")) : g.deductions.honesty}
            odds={g.deductions.killerOdds}
            turned={g.turned}
            onClose={() => setNotebook(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Surname only, the room is small and full names crowd every label. */
function lastName(name: string): string {
  const parts = name.split(" ");
  return parts[parts.length - 1] ?? name;
}

function Act({
  children,
  onClick,
  disabled,
  tone = "plain",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "plain" | "brass" | "blood";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "cursor-pointer border px-3 py-2 font-mono text-[10px] tracking-file transition-colors disabled:cursor-not-allowed disabled:border-ink-3 disabled:text-bone-dim/75",
        tone === "blood"
          ? "border-blood-hot bg-blood-hot/15 text-blood-hot hover:bg-blood-hot/25"
          : tone === "brass"
            ? "border-brass text-brass hover:bg-brass/15"
            : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
      ].join(" ")}
    >
      {children}
    </button>
  );
}


/**
 * How long this case stands.
 *
 * A case is open for a fixed window and then it settles, so the clock is the one piece of
 * state that is always worth a glance. It sits in the middle of the screen because it
 * belongs to the room rather than to any one suspect.
 */
function Countdown({ closesAt }: { closesAt: number }) {
  // Anchored to closesAt rather than to a clock read during render, which would differ
  // between the server pass and the browser's first pass and fail hydration.
  const [now, setNow] = useState(closesAt);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, closesAt - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  const urgent = left < 5 * 60_000;

  return (
    <div className="pointer-events-none text-center">
      <p className="font-mono text-[10px] tracking-file text-bone-dim">
        {left === 0 ? "CASE CLOSED" : "CLOSES IN"}
      </p>
      <p
        className={`font-mono text-[30px] leading-none tabular-nums ${urgent ? "text-blood-hot" : "text-bone"}`}
        style={{ textShadow: "0 2px 12px rgb(0 0 0 / 0.9)" }}
      >
        {h > 0 ? `${pad(h)}:` : ""}
        {pad(m)}:{pad(sec)}
      </p>
    </div>
  );
}
