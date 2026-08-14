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
  const g = useCase({ alibis, caseId: variant });
  const [chosen, setChosen] = useState<number | null>(null);
  const [line, setLine] = useState<Line | null>(null);

  // No opening narration here. The case card the player just clicked through says the same
  // thing at more length, and saying it again in a bar that slides away three seconds later
  // is the same paragraph twice: once in a modal, once underneath it.

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
      {/* ── the room is the page: one background, edge to edge ──
          `isolate` matters more than it looks. The figures inside carry z-indexes of their
          own (a speaker lifts to 400 so his bubble clears the lineup), and with this wrapper
          left at `z-auto` those indexes join the *page's* stacking context rather than
          staying in the room's — which put a suspect, and the crime-scene svg, on top of the
          stake bar. The money was in the DOM, on screen, and painted over. */}
      <div className="isolate absolute inset-0 z-0">
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
            // Anyone, at any point. Naming a man used to require hearing all of them first,
            // which is a rule the game never had a reason to enforce: the accounts are free
            // and public, and a player who already knows who they like should not have to
            // click through five men they do not care about to be allowed to say so.
            if (!locked) setChosen(seat);
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
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-4 pb-12 pt-14 sm:px-7 sm:pt-16"
          style={{ background: "linear-gradient(rgb(6 5 7 / 0.72), rgb(6 5 7 / 0.3) 60%, transparent)" }}
        >
          <div>
            {chapter && (
              <p className="font-mono text-[10px] tracking-file text-blood-hot">{chapter}</p>
            )}
            <h1 className="font-type text-[22px] leading-tight text-bone drop-shadow sm:text-[28px]">
              {title}
            </h1>
            {/* The figures are clickable and nothing said so. This lived on the bottom edge
                once, under the account bar that covers it, which is the same as not being
                there. It sits under the title until the room has been heard out, then goes:
                an instruction that outlives its job is just clutter over a crime scene. */}
            {!g.allSpoken && (
              <p className="mt-1.5 font-body text-[13px] leading-snug text-bone-dim">
                Click each person to hear where they were.{" "}
                <span className="text-brass">
                  {g.spoken.length} of {g.n} heard
                </span>
              </p>
            )}
          </div>

        </div>

        {closesAt !== undefined && <Countdown closesAt={closesAt} />}

        {/* The bar and the stake panel both live on the bottom edge, and the bar is opaque
            and sits above it. Once the panel is up it is what the player came for, so the bar
            gives way: the account is not lost, the speaker still says his piece in a bubble
            over his own head. */}
        <Dialogue line={stakePanel ? null : line} />
      </div>

      {/* ── the money, always on screen ──
          It used to appear only once every account had been heard, which read as a missing
          feature rather than a locked one: a player who had questioned three of six saw an
          empty strip of floor where the betting is, and the line that used to explain the
          wait sat underneath the account bar where nobody could read it. The panel is always
          here now and says what it is waiting for; the button stays disabled until there is
          somebody to name.
          There used to be a running instruction here too — "click anyone", then "that's 3 of
          6" — but it sat underneath the account bar that covers this same edge of the screen,
          so most of it was hidden behind whoever was speaking and the visible half read as a
          sentence someone had cut in two. The room already tells the player what to do: the
          figures are clickable and the account appears when one of them talks. */}
      {stakePanel && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 px-4 pb-16 pt-14 sm:px-7"
          // Not a panel: no edges, no box, just the floor going dark under the type. The
          // room reaches the bottom of the frame either way, but a stake row laid over a
          // body and a trail of blood is a stake row nobody can read.
          style={{
            background:
              "linear-gradient(transparent, rgb(6 5 7 / 0.72) 38%, rgb(6 5 7 / 0.94) 100%)",
          }}
        >
          {/* Nothing behind it. No box, no wash: the room runs all the way to the bottom of
              the frame and the money sits on top of it. */}
          <div className="mx-auto max-w-[1100px] py-1">{stakePanel}</div>
        </div>
      )}
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
