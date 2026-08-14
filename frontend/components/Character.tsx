"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Retro cartoon characters, drawn as parameterised SVG.
 *
 * Style target is 1960s limited animation. UPA / early Hanna-Barbera: bold flat fills,
 * one heavy warm-black outline, no gradients, exaggerated silhouettes that stay readable
 * at 48px. Everything is drawn rather than loaded, so there are no image assets to license
 * and a suspect can change expression per frame without a spritesheet.
 *
 * Expression is the whole point. A suspect who is lying to you should *look* like it a
 * beat too late, and the eyes are the cheapest, loudest instrument for that.
 */

export type Expression =
  | "neutral"
  | "talking"
  | "shifty" // eyes slide away, the tell
  | "nervous" // sweat, raised brows
  | "smug"
  | "shocked"
  | "caught" // exposed as a liar
  | "sinister"; // unmasked as Red John

/**
 * What a suspect does while nobody is asking them anything.
 *
 * A room of people standing to attention facing the camera reads as a lineup at a police
 * station. These are civilians who have just been in the same house as a murder, so they
 * fidget: someone scratches his head at the whole business, someone cannot stop shaking,
 * and one of them keeps almost smiling and catching himself.
 */
export type Idle =
  | "still"
  | "scratch"
  | "scared"
  | "giggle"
  | "glance"
  | "shift"
  /** Hands in his pockets, weight rolling gently from one foot to the other. */
  | "pocket"
  /** Arms folded, waiting you out. */
  | "fold"
  /** Agreeing with nobody in particular, slowly. */
  | "nod";

export type FaceShape = "oval" | "square" | "round" | "long";
export type HairStyle =
  | "slick" | "side-part" | "bald" | "combover" | "wavy"
  | "crew" | "bouffant" | "receding" | "long" | "curly";
export type NoseStyle = "button" | "hook" | "broad" | "pointed" | "bulb";
export type FacialHair = "none" | "mustache" | "goatee" | "stubble" | "fullbeard";
export type Accessory = "none" | "glasses" | "hat" | "badge" | "bowtie" | "pipe";

export interface CharacterSpec {
  id: string;
  skin: string;
  hairColor: string;
  hair: HairStyle;
  face: FaceShape;
  nose: NoseStyle;
  facialHair: FacialHair;
  accessory: Accessory;
  suit: string;
  shirt: string;
  tie: string;
  /** Slight head tilt, in degrees, stops a lineup looking like clones. */
  tilt: number;
  /**
   * Whether this person reads as a woman.
   *
   * Here for the narrator rather than the drawing: the speech engine has no idea who it is
   * reading for, and a lineup where half the men answer in a woman's voice is a lineup
   * nobody believes. Optional, and absent means "not specified", which the voice picker
   * treats as the larger, mixed pool rather than as a man.
   */
  feminine?: boolean;
}

const INK = "#1c1613";

// ── expression tables ───────────────────────────────────────
// Each expression is just a set of brow angles, pupil offsets and a mouth path. Keeping
// them declarative means a new expression is data, not code.

const BROWS: Record<Expression, { l: number; r: number; y: number }> = {
  neutral: { l: 0, r: 0, y: 0 },
  talking: { l: -4, r: 4, y: -1 },
  shifty: { l: 8, r: -3, y: 1 },
  nervous: { l: -16, r: 16, y: -4 },
  smug: { l: -12, r: 6, y: -2 },
  shocked: { l: -10, r: 10, y: -6 },
  caught: { l: -18, r: 18, y: -5 },
  sinister: { l: 16, r: -16, y: 3 },
};

const PUPILS: Record<Expression, { x: number; y: number; r: number }> = {
  neutral: { x: 0, y: 0, r: 2.6 },
  talking: { x: 0, y: -0.4, r: 2.6 },
  shifty: { x: 2.6, y: 0.6, r: 2.3 },
  nervous: { x: -0.6, y: -0.6, r: 1.9 },
  smug: { x: 1.4, y: 0.8, r: 2.4 },
  shocked: { x: 0, y: 0, r: 1.5 },
  caught: { x: 0, y: -0.8, r: 1.6 },
  sinister: { x: 0, y: 0.5, r: 2.9 },
};

function mouthPath(e: Expression, talkFrame: number): string {
  switch (e) {
    case "talking":
      return talkFrame % 2 === 0
        ? "M40 76 Q50 84 60 76 Q50 80 40 76 Z"
        : "M41 76 Q50 79 59 76";
    case "shifty":
      return "M41 77 Q50 75 59 78";
    case "nervous":
      return "M41 79 Q50 73 59 79";
    case "smug":
      return "M40 76 Q50 82 60 74";
    case "shocked":
      return "M50 78 m-5 0 a5 6 0 1 0 10 0 a5 6 0 1 0 -10 0";
    case "caught":
      return "M50 78 m-6 0 a6 7 0 1 0 12 0 a6 7 0 1 0 -12 0";
    case "sinister":
      return "M38 74 Q50 86 62 74 Q50 79 38 74 Z";
    default:
      return "M41 77 Q50 80 59 77";
  }
}

// ── parts ───────────────────────────────────────────────────

function faceOutline(shape: FaceShape) {
  switch (shape) {
    case "square":
      return <rect x="24" y="26" width="52" height="62" rx="16" />;
    case "round":
      return <circle cx="50" cy="56" r="29" />;
    case "long":
      return <ellipse cx="50" cy="57" rx="24" ry="34" />;
    default:
      return <ellipse cx="50" cy="56" rx="27" ry="31" />;
  }
}

function Hair({ style, color }: { style: HairStyle; color: string }) {
  const p = { fill: color, stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round" as const };
  switch (style) {
    case "bald":
      return null;
    case "receding":
      return <path d="M25 40 Q32 27 50 27 Q68 27 75 40 Q66 34 50 35 Q34 34 25 40 Z" {...p} />;
    case "slick":
      return <path d="M23 42 Q26 21 50 21 Q74 21 77 42 Q70 30 50 30 Q30 30 23 42 Z" {...p} />;
    case "side-part":
      return <path d="M23 42 Q25 20 50 20 Q76 20 77 42 Q72 31 44 31 Q31 31 23 42 Z" {...p} />;
    case "combover":
      return <path d="M23 41 Q28 22 52 22 Q76 22 77 40 Q60 31 38 34 Q28 36 23 41 Z" {...p} />;
    case "crew":
      return <path d="M24 40 Q24 22 50 22 Q76 22 76 40 Q74 32 50 32 Q26 32 24 40 Z" {...p} />;
    case "wavy":
      return (
        <path
          d="M22 43 Q22 19 50 19 Q78 19 78 43 Q73 34 66 38 Q58 30 50 36 Q42 29 34 37 Q27 33 22 43 Z"
          {...p}
        />
      );
    case "bouffant":
      return <path d="M20 44 Q18 16 50 16 Q82 16 80 44 Q74 28 50 28 Q26 28 20 44 Z" {...p} />;
    case "curly":
      return (
        <g {...p}>
          <circle cx="32" cy="30" r="10" />
          <circle cx="50" cy="24" r="11" />
          <circle cx="68" cy="30" r="10" />
          <circle cx="26" cy="42" r="8" />
          <circle cx="74" cy="42" r="8" />
        </g>
      );
    case "long":
      return <path d="M21 44 Q19 18 50 18 Q81 18 79 44 L79 72 Q74 56 72 40 Q60 30 50 30 Q40 30 28 40 Q26 56 21 72 Z" {...p} />;
    default:
      return null;
  }
}

function Nose({ style }: { style: NoseStyle }) {
  const s = { fill: "none", stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const };
  switch (style) {
    case "hook":
      return <path d="M50 56 L53 66 Q49 69 46 66" {...s} />;
    case "broad":
      return <path d="M45 66 Q50 69 55 66 M50 57 L50 64" {...s} />;
    case "pointed":
      return <path d="M50 55 L54 67 L47 67" {...s} />;
    case "bulb":
      return <circle cx="50" cy="64" r="4.5" fill="none" stroke={INK} strokeWidth="2.4" />;
    default:
      return <path d="M49 57 Q52 64 48 66" {...s} />;
  }
}

function FacialHairPart({ style, color }: { style: FacialHair; color: string }) {
  const p = { fill: color, stroke: INK, strokeWidth: 2.2, strokeLinejoin: "round" as const };
  switch (style) {
    case "mustache":
      // Sits in the gap between the nose and the mouth, with a dip under the septum and
      // ends that turn down past the corners of the mouth.
      return (
        <path
          d="M36 70 Q42 65 50 68 Q58 65 64 70 Q62 75 56 73 Q50 71 44 73 Q38 75 36 70 Z"
          {...p}
        />
      );
    case "goatee":
      // A Van Dyke: chin below the lip, thin moustache above it, and the mouth clear in
      // between. Anything that crosses the mouth at this size reads as a smudge.
      return (
        <g {...p}>
          <path d="M42 81 Q43 90 50 91 Q57 90 58 81 Q50 84.5 42 81 Z" />
          <path d="M39 70 Q44 66 50 69 Q56 66 61 70 Q56 73.5 50 71.5 Q44 73.5 39 70 Z" />
        </g>
      );
    case "stubble":
      return (
        <path
          d="M28 66 Q30 86 50 88 Q70 86 72 66 Q68 82 50 83 Q32 82 28 66 Z"
          fill={color}
          opacity="0.35"
        />
      );
    case "fullbeard":
      return <path d="M26 60 Q28 90 50 92 Q72 90 74 60 Q70 78 50 79 Q30 78 26 60 Z" {...p} />;
    default:
      return null;
  }
}

function AccessoryPart({ style, suit }: { style: Accessory; suit: string }) {
  switch (style) {
    case "glasses":
      return (
        <g fill="none" stroke={INK} strokeWidth="2.4">
          <circle cx="39" cy="54" r="9" fill="#cfe6ef" fillOpacity="0.35" />
          <circle cx="61" cy="54" r="9" fill="#cfe6ef" fillOpacity="0.35" />
          <path d="M48 54 L52 54 M30 52 L24 50 M70 52 L76 50" />
        </g>
      );
    case "hat":
      return (
        <g stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M16 34 Q50 26 84 34 Q50 42 16 34 Z" fill="#4a3f36" />
          <path d="M28 34 Q28 12 50 12 Q72 12 72 34 Z" fill="#5b4d42" />
          <path d="M28 30 Q50 26 72 30 L72 34 Q50 30 28 34 Z" fill="#2f2721" />
        </g>
      );
    case "badge":
      return (
        <g stroke={INK} strokeWidth="1.8">
          <path d="M28 112 l4 -8 l4 8 l-4 3 Z" fill="#d9a441" />
        </g>
      );
    case "bowtie":
      return (
        <g stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M50 104 L40 99 L40 109 Z" fill={suit} />
          <path d="M50 104 L60 99 L60 109 Z" fill={suit} />
          <circle cx="50" cy="104" r="2.6" fill={INK} />
        </g>
      );
    case "pipe":
      return (
        <g stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M60 78 L74 82" />
          <path d="M74 78 a4 4 0 1 0 0 8 Z" fill="#6b4a32" />
        </g>
      );
    default:
      return null;
  }
}

/**
 * The standing figure, from the collar down.
 *
 * This owns the *entire* body, shoulders, torso, shirt, tie, arms, legs. The
 * head-and-shoulders drawing has its own collar for the portrait crop, and rendering both
 * produced a cape over a second torso with two ties and hands floating at chest height. In
 * full-body mode that collar is skipped and everything below the neck comes from here, so
 * there is exactly one shoulder line and it meets the neck where it should.
 *
 * Proportions are deliberately cartoon: the head is about a quarter of total height, which
 * is wrong anatomically and right for 1960s limited animation.
 *
 * Posture carries as much as the face at full height, a nervous suspect draws his arms in,
 * a smug one plants his feet.
 */
function Body({
  spec,
  expression,
  idle,
}: {
  spec: CharacterSpec;
  expression: Expression;
  idle?: Idle;
}) {
  const open = expression === "smug" || expression === "sinister";

  const armIn = armInFor(expression);
  const stance = open ? 5 : 0; // feet planted wider

  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* legs first, so the jacket hem overlaps the waist */}
      <path
        d={`M39 176 L${36 - stance} 232 L${35 - stance} 243 L48 243 L49 176 Z`}
        fill={spec.suit} stroke={INK} strokeWidth="2.6"
      />
      <path
        d={`M51 176 L52 243 L${65 + stance} 243 L${64 + stance} 232 L61 176 Z`}
        fill={spec.suit} stroke={INK} strokeWidth="2.6"
      />
      <path
        d={`M${33 - stance} 241 h17 v7 h-19 a3.5 3.5 0 0 1 2 -7 Z`}
        fill="#241c17" stroke={INK} strokeWidth="2.3"
      />
      <path
        d={`M50 241 h${17 + stance} a3.5 3.5 0 0 1 2 7 h-19 Z`}
        fill="#241c17" stroke={INK} strokeWidth="2.3"
      />

      {/* shirt and tie sit behind the jacket and show through the opening */}
      <path d="M44 92 L50 126 L56 92 L56 152 L44 152 Z" fill={spec.shirt} stroke={INK} strokeWidth="2.2" />
      <path d="M50 100 L54.5 114 L50 148 L45.5 114 Z" fill={spec.tie} stroke={INK} strokeWidth="2" />

      <Arms spec={spec} armIn={armIn} idle={idle} />

      {/* the jacket is TWO lapel panels meeting at the button, not one slab, a single
          closed shape buried the shirt and tie entirely */}
      <path
        d="M27 106 Q28 98 35 95 Q42 92 45 94 L50 124 L50 176 L33 176 Z"
        fill={spec.suit} stroke={INK} strokeWidth="2.7"
      />
      <path
        d="M73 106 Q72 98 65 95 Q58 92 55 94 L50 124 L50 176 L67 176 Z"
        fill={spec.suit} stroke={INK} strokeWidth="2.7"
      />

    </g>
  );
}

/** Arms tuck in when anxious and hang loose when cocky. Shared so the raised arm agrees. */
function armInFor(expression: Expression): number {
  // Kept small. These swing the whole arm about the shoulder, and past a few degrees the
  // sleeve walks out from under the jacket and the man stands there with his arms floating
  // beside him — which is exactly what -7 was doing to every smug figure in the lineup.
  if (expression === "nervous" || expression === "caught" || expression === "shocked") return 3;
  if (expression === "smug" || expression === "sinister") return -4;
  return 0;
}

/**
 * The arms, drawn *before* the jacket so its shoulder always covers where they join.
 *
 * They used to be drawn last and start at the shoulder line exactly, which meant any
 * rotation opened a visible wedge of background between arm and body and the figure read as
 * a torso with two sticks propped against it. Starting them up inside the shoulder and
 * letting the jacket overlap makes the joint impossible to break, at any angle.
 *
 * The exception is an arm on its way to his head, which passes in front of the chest and
 * has to be drawn after the jacket instead. `Body` renders that one itself.
 */
function HangingArm({ spec, armIn }: { spec: CharacterSpec; armIn: number }) {
  return (
    <g
      transform={`rotate(${armIn} 31 99)`}
      style={{ transformOrigin: "31px 99px" }}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* The hand goes in first and the cuff is drawn over it. Drawn the other way round,
          its own outline runs straight across the end of the sleeve and the hand reads as a
          ball stuck onto the arm rather than as a hand coming out of it. */}
      <circle cx="25" cy="163.5" r="6.4" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
      <path d="M31 86 Q18 126 19 158.5 L31 159.5 Q31 126 38 88 Z" fill={spec.suit} stroke={INK} strokeWidth="2.6" />
    </g>
  );
}

/**
 * The arm that has gone up to scratch his head.
 *
 * Drawn bent rather than swung: rotating the hanging arm about the shoulder is a rigid bar
 * on a 60-unit radius, and every angle that got the hand near his head laid the whole limb
 * diagonally across his face. A real scratch needs an elbow, so this is its own shape, with
 * the elbow out to the side and the hand up on the hairline.
 *
 * He never puts it down. The animation is only the scratching itself, because cross-fading
 * between two different arm shapes is a morph, and a man standing with his hand on his head
 * is a perfectly good read.
 */
function ScratchArm({ spec }: { spec: CharacterSpec }) {
  return (
    <g className="arm-scratch" style={{ transformOrigin: "31px 99px" }}>
      <path
        d="M31 97 L15 71 L28 42"
        fill="none"
        stroke={INK}
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31 97 L15 71 L28 42"
        fill="none"
        stroke={spec.suit}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* cuff, so the hand does not look welded to the sleeve */}
      <path d="M24 50 L34 55" stroke={INK} strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
      <circle cx="30" cy="38" r="6.4" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
      {/* fingers in the hair */}
      <path
        d="M28 32 l-1.5 -4 M32 32 l0.5 -4 M35 34 l3 -3"
        stroke={INK}
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/**
 * Hands in his pockets.
 *
 * Same trick as the scratch: a stroked path with a real elbow, because rotating the rigid
 * hanging arm can only ever swing it, and a man with his hands in his pockets is bent at
 * the elbow with his forearms angled in. No hand circles, because the hands are the one
 * part of this pose you are not supposed to see.
 */
function PocketArms({ spec }: { spec: CharacterSpec }) {
  const arm = (d: string) => (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={spec.suit} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  return (
    <g>
      {arm("M31 97 L16 127 L34 151")}
      {arm("M69 97 L84 127 L66 151")}
    </g>
  );
}

/**
 * Arms folded, which is the whole personality of some people in a police lineup.
 *
 * His left goes over his right, the way most people fold, and the hands land tucked under
 * the opposite arm rather than out in the open, so the pose reads closed rather than as two
 * limbs that happen to overlap.
 */
function FoldedArms({ spec }: { spec: CharacterSpec }) {
  const arm = (d: string) => (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={spec.suit} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  return (
    <g>
      {/* his right, screen left, underneath */}
      {arm("M31 99 L26 122 L60 131")}
      <circle cx="62" cy="131" r="6" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
      {/* his left, screen right, over the top */}
      {arm("M69 99 L74 118 L40 126")}
      <circle cx="38" cy="126" r="6" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
    </g>
  );
}

function Arms({
  spec,
  armIn,
  idle,
}: {
  spec: CharacterSpec;
  armIn: number;
  idle?: Idle;
}) {
  // Nothing behind the jacket for these two: their arms come round the front of it, and
  // drawing them back here buried the fold entirely inside the torso.
  if (idle === "pocket" || idle === "fold") return null;

  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* his right, screen left. Only drawn back here when it is hanging at his side: a
          raised arm has to be in front of the jacket or it disappears into the torso. */}
      {idle !== "scratch" && <HangingArm spec={spec} armIn={armIn} />}
      {/* his left, screen right */}
      <g transform={`rotate(${-armIn} 69 99)`} style={{ transformOrigin: "69px 99px" }}>
        <circle cx="75" cy="163.5" r="6.4" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
        <path d="M69 86 Q82 126 81 158.5 L69 159.5 Q69 126 62 88 Z" fill={spec.suit} stroke={INK} strokeWidth="2.6" />
      </g>
    </g>
  );
}

// ── the character ───────────────────────────────────────────

export function Character({
  spec,
  expression = "neutral",
  /** Draw the whole figure, standing, for the room scene. */
  fullBody = false,
  /** What they do when left alone. Only meaningful in `fullBody`. */
  idle = "still",
  className,
  style,
}: {
  spec: CharacterSpec;
  expression?: Expression;
  fullBody?: boolean;
  idle?: Idle;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [blink, setBlink] = useState(false);
  const [talkFrame, setTalkFrame] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Idle blinking. Irregular on purpose, a metronome blink reads as a machine.
  useEffect(() => {
    let alive = true;
    const loop = () => {
      timer.current = setTimeout(
        () => {
          if (!alive) return;
          setBlink(true);
          setTimeout(() => alive && setBlink(false), 110);
          loop();
        },
        2200 + Math.random() * 3600,
      );
    };
    loop();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Mouth flap while speaking.
  useEffect(() => {
    if (expression !== "talking") return;
    const id = setInterval(() => setTalkFrame((f) => f + 1), 140);
    return () => clearInterval(id);
  }, [expression]);

  const brow = BROWS[expression];
  const pupil = PUPILS[expression];
  // Only idle figures let their eyes wander. Once someone is talking or has been caught,
  // the expression owns the face and a drifting pupil fights it.
  const gazeClass =
    expression === "neutral" || expression === "smug"
      ? idle === "scared" || idle === "glance"
        ? "eyes-flick"
        : "eyes-drift"
      : undefined;
  const shut = blink && expression !== "shocked" && expression !== "caught";

  return (
    <svg
      viewBox={fullBody ? "8 10 84 244" : "14 6 72 100"}
      className={className}
      style={{ transition: "opacity 250ms, filter 250ms", ...style }}
      aria-hidden
    >
      <g
        transform={`rotate(${spec.tilt} 50 70)`}
        className={
          idle === "scared"
            ? "idle-scared"
            : idle === "giggle"
              ? "idle-giggle"
              : idle === "shift"
                ? "idle-shift"
                : idle === "glance"
                  ? "idle-glance"
                  : idle === "pocket"
                    ? "idle-sway"
                    : idle === "nod" || idle === "fold"
                      ? "idle-nod"
                      : undefined
        }
        // A negative delay starts the cycle already part-way through, so two frightened men
        // standing next to each other lose their nerve at different moments. Derived from
        // the figure's own tilt, which is fixed per suspect, so his rhythm is his own and
        // survives a re-render.
        style={{
          transformOrigin: "50px 240px",
          ["--shiver-phase" as string]: `${-((Math.abs(spec.tilt) * 4.7) % 15).toFixed(2)}s`,
        }}
      >
        {fullBody ? (
          <Body spec={spec} expression={expression} idle={idle} />
        ) : (
          <>
            {/* portrait crop only: its own collar, so a bust reads as clothed */}
            <path
              d="M8 130 Q12 100 34 94 L50 100 L66 94 Q88 100 92 130 Z"
              fill={spec.suit}
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path d="M38 96 L50 108 L62 96 L58 94 L50 102 L42 94 Z" fill={spec.shirt} stroke={INK} strokeWidth="2" />
            <path d="M50 104 L54 112 L50 126 L46 112 Z" fill={spec.tie} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          </>
        )}

        {/* neck, drawn after the body so the jaw sits in front of the collar */}
        <path d="M42 82 L42 99 Q50 104 58 99 L58 82 Z" fill={spec.skin} stroke={INK} strokeWidth="2.5" />

        {/* ears */}
        <ellipse cx="23" cy="58" rx="5" ry="7" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
        <ellipse cx="77" cy="58" rx="5" ry="7" fill={spec.skin} stroke={INK} strokeWidth="2.4" />

        {/* head */}
        <g fill={spec.skin} stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
          {faceOutline(spec.face)}
        </g>

        <Hair style={spec.hair} color={spec.hairColor} />

        {/* brows */}
        <g stroke={INK} strokeWidth="3.2" strokeLinecap="round">
          <line
            x1="31" y1={45 + brow.y} x2="45" y2={45 + brow.y}
            transform={`rotate(${brow.l} 38 ${45 + brow.y})`}
          />
          <line
            x1="55" y1={45 + brow.y} x2="69" y2={45 + brow.y}
            transform={`rotate(${brow.r} 62 ${45 + brow.y})`}
          />
        </g>

        {/* eyes */}
        {shut ? (
          <g stroke={INK} strokeWidth="2.6" strokeLinecap="round">
            <path d="M33 54 Q39 58 45 54" />
            <path d="M55 54 Q61 58 67 54" />
          </g>
        ) : (
          <>
            <ellipse cx="39" cy="54" rx="6.5" ry="7" fill="#fdfbf6" stroke={INK} strokeWidth="2.2" />
            <ellipse cx="61" cy="54" rx="6.5" ry="7" fill="#fdfbf6" stroke={INK} strokeWidth="2.2" />
            <g className={gazeClass}>
              <circle cx={39 + pupil.x} cy={54 + pupil.y} r={pupil.r} fill={INK} />
              <circle cx={61 + pupil.x} cy={54 + pupil.y} r={pupil.r} fill={INK} />
            </g>
          </>
        )}

        <Nose style={spec.nose} />

        {/* mouth */}
        <path
          d={mouthPath(expression, talkFrame)}
          fill={expression === "shocked" || expression === "caught" ? "#5b2b2b" : expression === "sinister" || expression === "talking" ? "#7a3030" : "none"}
          stroke={INK}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <FacialHairPart style={spec.facialHair} color={spec.hairColor} />
        <AccessoryPart style={spec.accessory} suit={spec.suit} />

        {/* The hand he is scratching with passes in front of his own head, so it is the
            last thing drawn. Anywhere earlier and the pose is correct but invisible. */}
        {fullBody && idle === "scratch" && <ScratchArm spec={spec} />}
        {fullBody && idle === "pocket" && <PocketArms spec={spec} />}
        {fullBody && idle === "fold" && <FoldedArms spec={spec} />}

        {/* sweat, the classic cartoon tell, and it only ever appears when it means something */}
        {(expression === "nervous" || expression === "caught") && (
          <g className="sweat">
            <path d="M76 40 q4 6 0 9 q-4 -3 0 -9 Z" fill="#8fd0e8" stroke={INK} strokeWidth="1.6" />
            {expression === "caught" && (
              <path d="M22 44 q3.5 5 0 8 q-3.5 -3 0 -8 Z" fill="#8fd0e8" stroke={INK} strokeWidth="1.6" />
            )}
          </g>
        )}

        {/* Red John's calling card, on the unmasking */}
        {expression === "sinister" && (
          // The same photograph the title and the cold open use, scaled down onto his face.
          // A path drawn at this size was always a different mark from the one on the wall,
          // and this is the moment the two are supposed to be recognisably the same hand.
          <image
            className="smiley"
            href="/brand/redjohn.png"
            x="27"
            y="30"
            width="46"
            height="46"
            opacity="0.92"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
      </g>
    </svg>
  );
}
