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
export type Idle = "still" | "scratch" | "scared" | "giggle" | "glance" | "shift";

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
      return <path d="M38 71 Q44 67 50 70 Q56 67 62 71 Q56 74 50 72 Q44 74 38 71 Z" {...p} />;
    case "goatee":
      return <path d="M44 71 Q50 69 56 71 Q57 82 50 86 Q43 82 44 71 Z" {...p} />;
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
  const tense = expression === "nervous" || expression === "caught" || expression === "shocked";
  const open = expression === "smug" || expression === "sinister";

  const armIn = tense ? 5 : open ? -7 : 0; // arms tucked when anxious, loose when cocky
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

      {/* arms swing clear of the torso so the silhouette reads as a person, not a slab.
          The left one is the one that goes up to scratch a head. */}
      <g
        transform={`rotate(${armIn} 29 104)`}
        className={idle === "scratch" ? "arm-scratch" : undefined}
        style={{ transformOrigin: "29px 104px" }}
      >
        <path d="M27 104 Q18 130 19 158 L30 159 Q29 130 33 106 Z" fill={spec.suit} stroke={INK} strokeWidth="2.6" />
        <circle cx="24.5" cy="165" r="6.5" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
      </g>
      <g transform={`rotate(${-armIn} 71 104)`}>
        <path d="M73 104 Q82 130 81 158 L70 159 Q71 130 67 106 Z" fill={spec.suit} stroke={INK} strokeWidth="2.6" />
        <circle cx="75.5" cy="165" r="6.5" fill={spec.skin} stroke={INK} strokeWidth="2.4" />
      </g>
    </g>
  );
}

// ── the character ───────────────────────────────────────────

export function Character({
  spec,
  expression = "neutral",
  /** Dim and desaturate, used for suspects the notebook has ruled out. */
  cleared = false,
  /** Draw the whole figure, standing, for the room scene. */
  fullBody = false,
  /** What they do when left alone. Only meaningful in `fullBody`. */
  idle = "still",
  className,
}: {
  spec: CharacterSpec;
  expression?: Expression;
  cleared?: boolean;
  fullBody?: boolean;
  idle?: Idle;
  className?: string;
}) {
  const [blink, setBlink] = useState(false);
  const [talkFrame, setTalkFrame] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Idle blinking. Irregular on purpose, a metronome blink reads as a machine.
  useEffect(() => {
    if (cleared) return;
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
  }, [cleared]);

  // Mouth flap while speaking.
  useEffect(() => {
    if (expression !== "talking") return;
    const id = setInterval(() => setTalkFrame((f) => f + 1), 140);
    return () => clearInterval(id);
  }, [expression]);

  const brow = BROWS[expression];
  const pupil = PUPILS[expression];
  const shut = blink && expression !== "shocked" && expression !== "caught";

  return (
    <svg
      viewBox={fullBody ? "8 10 84 244" : "14 6 72 100"}
      className={className}
      style={{
        filter: cleared ? "grayscale(1)" : undefined,
        opacity: cleared ? 0.4 : 1,
        transition: "opacity 250ms, filter 250ms",
      }}
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
                  : undefined
        }
        style={{ transformOrigin: "50px 240px" }}
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
            <circle cx={39 + pupil.x} cy={54 + pupil.y} r={pupil.r} fill={INK} />
            <circle cx={61 + pupil.x} cy={54 + pupil.y} r={pupil.r} fill={INK} />
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
          <g className="smiley" stroke="#a81c1c" strokeWidth="3" fill="none" strokeLinecap="round">
            <circle cx="50" cy="52" r="21" opacity="0.9" />
            <path d="M40 46 L40 46 M60 46 L60 46" strokeWidth="7" />
            <path d="M38 60 Q50 70 62 60" />
          </g>
        )}
      </g>
    </svg>
  );
}
