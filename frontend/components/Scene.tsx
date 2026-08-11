"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CONTROL_COST, fullMask, maskSeats, popcount, type CaseConfig } from "@/lib/case";
import type { Suspect } from "@/lib/suspects";
import type { Oracle } from "@/lib/oracle";
import { Character, type CharacterSpec, type Expression } from "./Character";
import { useCase } from "@/hooks/useCase";
import { Room, type RoomSubject } from "./Room";
import { Dialogue, type Line } from "./Dialogue";
import { Notebook } from "./Notebook";
import { PhaseBanner } from "./PhaseBanner";
import { janeism } from "@/lib/script";
import * as sfx from "@/lib/sound";

/**
 * The game, played in a room.
 *
 * The whole screen is the scene. Everything else — the transcript, the deduction grid, the
 * question builder — is furniture that slides over it, so the suspects are never off screen
 * while you are talking to them.
 */
export function Scene({
  config,
  oracle,
  suspects,
  chapter,
  title,
  nudge,
  onResolved,
}: {
  config: CaseConfig;
  oracle: Oracle;
  suspects: Suspect[];
  chapter?: string;
  title: string;
  nudge?: { name: string; spec: CharacterSpec; line: string } | null;
  onResolved?: (solved: boolean, focusLeft: number) => void;
}) {
  const g = useCase({ config, oracle, onResolved });
  const [notebook, setNotebook] = useState(false);
  const [line, setLine] = useState<Line | null>(null);

  // Open on the room, then a beat of narration so the player reads the space before the
  // interface arrives.
  useEffect(() => {
    if (!g.ready) return;
    setLine({
      text: `${config.liars} of these ${g.n} are lying. Red John always is.`,
      tone: "narrator",
    });
    const id = setTimeout(() => setLine(null), 5200);
    return () => clearTimeout(id);
  }, [g.ready, config.liars, g.n]);

  // A newly proven liar gets a plucked string — the "tell". Tracked so it fires once per
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

        let expression: Expression = "neutral";
        if (g.truth) expression = isKiller ? "sinister" : "neutral";
        else if (g.saying?.seat === i) expression = "talking";
        else if (g.busy && g.witness === i) expression = "shifty";
        else if (honesty === "liar") expression = "caught";
        else if (g.witness === i) expression = "nervous";
        else if (i % 3 === 0) expression = "smug";

        return {
          suspect: s,
          expression,
          cleared: g.truth ? !isKiller : !g.deductions.candidates.includes(i),
          liar: honesty === "liar",
          honest: honesty === "honest",
          inQuestion: ((g.mask >> i) & 1) === 1,
          turned: g.turned.includes(i),
        };
      }),
    [suspects, g.truth, g.deductions, g.saying, g.busy, g.witness, g.mask, g.turned],
  );

  const control = fullMask(g.n);
  const only = g.deductions.candidates.length === 1 ? g.deductions.candidates[0] : null;
  const marked = popcount(g.mask) === 1 ? maskSeats(g.mask, g.n)[0] : null;
  const nameable = only ?? marked;

  return (
    <div className="relative mx-auto w-full max-w-[1400px]">
      {/* ── the scene ── */}
      <div className="relative">
        <Room
          subjects={subjects}
          focused={g.witness}
          onFocus={g.chooseWitness}
          onToggle={g.toggle}
          disabled={g.over || g.busy || !g.ready}
        />

        {/* HUD: case, focus, possibility space */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-3 sm:p-5">
          <div>
            {chapter && (
              <p className="font-mono text-[9px] tracking-file text-blood-hot">{chapter}</p>
            )}
            <h1 className="font-type text-[20px] leading-tight text-bone drop-shadow sm:text-[26px]">
              {title}
            </h1>
          </div>

          <div className="flex items-start gap-4">
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-file text-bone-dim">FOCUS</p>
              <div className="mt-1 flex justify-end gap-1">
                {Array.from({ length: config.focus }, (_, i) => (
                  <span
                    key={i}
                    className={[
                      "h-4 w-[6px] border",
                      i < g.focusLeft ? "border-blood-hot bg-blood-hot/80" : "border-ink-3",
                    ].join(" ")}
                  />
                ))}
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-file text-bone-dim">STILL POSSIBLE</p>
              <p
                className={`font-type text-[24px] leading-none ${g.deductions.candidates.length === 1 ? "text-blood-hot" : "text-bone"}`}
              >
                {g.deductions.candidates.length}
                <span className="text-[13px] text-bone-dim">/{g.n}</span>
              </p>
            </div>
          </div>
        </div>

        {/* the team, leaning in */}
        {nudge && !g.over && !line && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="pointer-events-none absolute bottom-4 left-4 flex max-w-[300px] items-end gap-2"
          >
            <div className="w-14 shrink-0 border border-ink-3 bg-ink/80">
              <Character spec={nudge.spec} expression="talking" className="h-16 w-full" />
            </div>
            <div className="border border-ink-3 bg-ink/90 px-2 py-1.5">
              <p className="font-mono text-[8px] tracking-file text-brass">
                {nudge.name.toUpperCase()}
              </p>
              <p className="font-body text-[11px] leading-snug text-bone-dim">
                &ldquo;{nudge.line}&rdquo;
              </p>
            </div>
          </motion.div>
        )}

        <Dialogue line={line} />
      </div>

      {/* ── the interrogation controls ── */}
      <div className="border-x-2 border-b-2 border-ink-3 bg-ink px-3 py-3 sm:px-5">
        {g.witness === null ? (
          <p className="py-2 text-center font-body text-[14px] italic text-bone-dim">
            {janeism(g.testimony.length)}
          </p>
        ) : (
          <>
            <p className="truncate font-body text-[14px] text-bone">
              <span className="font-type">{suspects[g.witness].name}</span>
              <span className="text-bone-dim">
                {" "}
                — &ldquo;is Red John one of{" "}
                {g.mask === 0 ? (
                  <em className="text-bone-dim/60">…nobody yet</em>
                ) : g.mask === control ? (
                  <span className="text-brass">all {g.n}</span>
                ) : (
                  <span className="text-bone">
                    {maskSeats(g.mask, g.n).map((s) => suspects[s].name.split(" ").pop()).join(", ")}
                  </span>
                )}
                ?&rdquo;
              </span>
            </p>
            {g.phase !== "idle" && <PhaseBanner phase={g.phase} />}
            {g.error && (
              <p className="shake mt-1 font-mono text-[10px] tracking-file text-blood-hot">{g.error}</p>
            )}
          </>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Act onClick={g.askAll} disabled={g.over || g.busy || g.witness === null || g.focusLeft < CONTROL_COST} tone="brass">
            ASK ABOUT EVERYONE · {CONTROL_COST}
          </Act>
          <Act onClick={g.askSelf} disabled={g.over || g.busy || g.witness === null}>
            &ldquo;ARE YOU RED JOHN?&rdquo; · 1
          </Act>
          <Act onClick={() => setNotebook(true)}>NOTEBOOK</Act>

          <span className="ml-auto flex items-center gap-2">
            {g.mask !== 0 && (
              <span className="font-mono text-[10px] tracking-file text-bone-dim">
                {popcount(g.mask)} MARKED · COST {g.cost}
              </span>
            )}
            <Act onClick={g.clear} disabled={g.mask === 0 || g.busy}>
              CLEAR
            </Act>
            <Act onClick={g.ask} disabled={!g.canAsk} tone="blood">
              {g.busy ? "…" : "PUT IT TO THEM"}
            </Act>
            <Act
              onClick={() => nameable !== null && void g.accuse(nameable)}
              disabled={g.busy || !g.ready || nameable === null || g.over}
              tone="brass"
            >
              NAME THEM
            </Act>
          </span>
        </div>

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
        "cursor-pointer border px-3 py-2 font-mono text-[10px] tracking-file transition-colors disabled:cursor-not-allowed disabled:border-ink-3 disabled:text-bone-dim/30",
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

