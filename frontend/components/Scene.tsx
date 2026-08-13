"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Alibi } from "@/lib/casebook";
import type { Suspect } from "@/lib/suspects";
import { Character, type CharacterSpec, type Expression, type Idle } from "./Character";
import { useCase } from "@/hooks/useCase";
import { Room, type RoomSubject } from "./Room";
import { Dialogue, type Line } from "./Dialogue";
import * as sfx from "@/lib/sound";

/**
 * The game, played in a room.
 *
 * The whole screen is the scene. Everything else is furniture that slides over it, so the
 * suspects are never off screen while you are listening to them.
 *
 * Nothing in here talks to a chain or needs a wallet. You walk in, you hear everyone out,
 * you decide. The one transaction in the game is the stake panel at the bottom, and it
 * only appears once the whole room has spoken.
 */

/**
 * The room's behaviour, in the order it is dealt round the lineup.
 *
 * A murder has just happened and these people were in the house. Two of them cannot keep
 * still, one keeps looking at her and away again, one scratches his head at the whole
 * business, and one of them is enjoying it and keeps catching himself. Nobody stands to
 * attention, because nobody stands to attention.
 */
const IDLES: Idle[] = [
  "scratch", "scared", "glance", "giggle", "shift", "pocket", "fold", "nod",
];

/**
 * Who does what, in this room.
 *
 * There used to be five behaviours dealt straight round the lineup, so the sixth man copied
 * the first: two figures with the same hand on the same side of the same head, which is the
 * single loudest way to make drawn people look like one drawn person. There are eight now,
 * more than fits in any room, and the deal is rotated by the case so the same man questioned
 * in two different rooms is not standing the same way in both.
 */
function idlesFor(count: number, variant: number): Idle[] {
  const offset = variant % IDLES.length;
  // A stride coprime with the list length walks the whole thing without repeating, so the
  // first `count` picks are distinct as long as the room is no bigger than the list.
  return Array.from(
    { length: count },
    (_, i) => IDLES[(offset + i * 3) % IDLES.length]!,
  );
}

export function Scene({
  suspects,
  alibis,
  chapter,
  title,
  nudge,
  closesAt,
  variant = 0,
  stakePanel,
  locked,
  onPick,
}: {
  suspects: Suspect[];
  /** Every account in this room, in seat order. Public data, straight out of the casebook. */
  alibis: Alibi[];
  chapter?: string;
  title: string;
  nudge?: { name: string; spec: CharacterSpec; line: string } | null;
  /** Unix ms this case stops accepting money. Drives the clock in the middle of the HUD. */
  closesAt?: number;
  /** Which crime scene this case is set in. */
  variant?: number;
  /** Shown once the whole room has spoken, so the stake is placed on an informed read. */
  stakePanel?: React.ReactNode;
  /** True while a stake is on the wire, which freezes who is being named but not the room. */
  locked?: boolean;
  /** Reports who the player is naming, so the wager can be placed on him. */
  onPick?: (seat: number | null, name: string | null) => void;
}) {
  const g = useCase({ alibis });
  const [chosen, setChosen] = useState<number | null>(null);
  const [line, setLine] = useState<Line | null>(null);

  // Open on the room, then a beat of narration so the player reads the space before the
  // interface arrives.
  useEffect(() => {
    setLine({
      text:
        `Every one of these ${g.n} was here, and every one of them has an account of it. ` +
        `One account cannot be true, and the man giving it is Red John.`,
      tone: "narrator",
    });
    const id = setTimeout(() => setLine(null), 3200);
    return () => clearTimeout(id);
  }, [g.n]);

  // Room tone and the music both run for the life of the scene.
  useEffect(() => {
    sfx.startRoomTone();
    sfx.startRoomBed();
    return () => {
      sfx.stopRoomTone();
      sfx.stopRoomBed();
    };
  }, []);

  // The music gets out of the way while somebody is speaking. The alibis are the whole game,
  // and a score you have to listen past is worse than no score.
  useEffect(() => {
    sfx.duckRoomBed(!!g.saying);
  }, [g.saying]);

  // An account takes over the bar the moment it lands.
  useEffect(() => {
    if (!g.saying) return;
    const s = suspects[g.saying.seat];
    setLine({
      speaker: { name: s.name, role: s.role, spec: s.character },
      text: g.saying.line,
    });
  }, [g.saying, suspects]);

  // What they do while nobody is asking them anything. Fixed per seat rather than random,
  // so a man who scratches his head keeps doing it and the room has faces you start to
  // recognise, and distinct within the room so nobody reads as a copy of his neighbour.
  const idles = useMemo(() => idlesFor(suspects.length, variant), [suspects.length, variant]);

  const subjects: RoomSubject[] = useMemo(
    () =>
      suspects.map((s, i) => {
        const idle: Idle = idles[i]!;

        let expression: Expression = "neutral";
        if (g.saying?.seat === i) expression = "talking";
        else if (chosen === i) expression = "nervous";
        // Idle behaviour drives the resting face too, or a man shaking with fear stares
        // blankly out at you while he does it.
        else if (idle === "scared") expression = "nervous";
        else if (idle === "giggle") expression = "smug";
        else if (idle === "glance") expression = "shifty";

        return {
          suspect: s,
          expression,
          heard: g.spoken.includes(i),
          named: chosen === i,
          idle: g.saying?.seat === i ? "still" : idle,
          saying: g.saying?.seat === i ? g.saying.line : null,
        };
      }),
    [suspects, idles, g.saying, g.spoken, chosen],
  );

  // Hand the choice up so the wager can be placed on it. The money and the accusation are
  // one act now: naming him *is* staking on him.
  useEffect(() => {
    onPick?.(chosen, chosen === null ? null : suspects[chosen]!.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, suspects]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* ── the room is the page: one background, edge to edge ── */}
      <div className="absolute inset-0">
        <Room
          subjects={subjects}
          focused={g.witness ?? chosen}
          // One click does both jobs: he says his piece again, and once everyone has had
          // their turn he becomes the man you are naming. Nothing here costs anything, so
          // there is no reason to make the player commit before they have heard him twice.
          //
          // Except while a stake is in flight. The name in that transaction was sealed before
          // the wallet ever opened, so moving the pick then would only change what the screen
          // says, not what was bet. Hearing him out again stays free.
          onFocus={(seat) => {
            // The speaker's own voice, not the one the alphabet happened to hand his seat.
            g.interrogate(seat, suspects[seat]?.character.feminine);
            if (g.allSpoken && !locked) setChosen(seat);
          }}
          // Clicking the room itself steps away from whoever you were standing over. Until
          // now the only way out of a man's face was into another man's, which is not how
          // walking away works. Held while a stake is in flight: the name in that
          // transaction is already sealed and the screen should not pretend otherwise.
          onStepBack={() => {
            if (locked) return;
            g.stepBack();
            setChosen(null);
          }}
          variant={variant}
        />

        {/* HUD: which case this is, and how long it stands. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-4 pb-12 pt-14 sm:px-7 sm:pt-16"
          style={{ background: "linear-gradient(rgb(6 5 7 / 0.72), rgb(6 5 7 / 0.3) 60%, transparent)" }}
        >
          <div>
            {chapter && (
              <p className="font-mono text-[10px] tracking-file text-blood-hot">{chapter}</p>
            )}
            <h1 className="font-type text-[22px] leading-tight text-bone drop-shadow sm:text-[28px]">
              {title}
            </h1>
          </div>

        </div>

        {closesAt !== undefined && <Countdown closesAt={closesAt} />}

        {/* the team, leaning in */}
        {nudge && !line && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
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

        {/* The bar and the stake panel both live on the bottom edge, and the bar is opaque
            and sits above it. Once the panel is up it is what the player came for, so the bar
            gives way: the account is not lost, the speaker still says his piece in a bubble
            over his own head. */}
        <Dialogue line={g.allSpoken && stakePanel ? null : line} />
      </div>

      {/* ── one instruction, always telling you the next click ── */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-16 pt-12 sm:px-7">
        {g.allSpoken && stakePanel ? (
          // Nothing behind it. No box, no wash: the room runs all the way to the bottom of
          // the frame and the money sits on top of it.
          <div className="mx-auto max-w-[1100px] py-1">{stakePanel}</div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 font-body text-[15px] leading-snug text-bone">
              {g.witness === null ? (
                <>
                  They&rsquo;re in the room and they&rsquo;re waiting.{" "}
                  <span className="text-blood-hot">Click anyone</span> and they&rsquo;ll tell
                  you where they were.
                </>
              ) : (
                <>
                  That&rsquo;s {g.spoken.length} of {g.n}.{" "}
                  <span className="text-blood-hot">Hear the rest of them out</span> before you
                  put money on anybody.
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * How long this case stands.
 *
 * A case takes money for a fixed window and then it closes, so the clock is the one piece
 * of state that is always worth a glance. It sits in the middle of the screen because it
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
    <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 text-center sm:top-16">
      <p className="font-mono text-[10px] tracking-file text-bone-dim">
        {left === 0 ? "CASE CLOSED" : "CASE CLOSES IN"}
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
