"use client";

import { useMemo } from "react";

/**
 * THE CRIME SCENE.
 *
 * The room the suspects are standing in is the room it happened in, so it should look like
 * it. A body on the floor, blood that pooled and then got walked through, a trail of prints
 * leading out, and his signature drying on the wall above it.
 *
 * Every case gets its own: the layout is generated from the case index rather than
 * hand-placed, so Chapter I and Chapter VI are recognisably different rooms without seven
 * sets of coordinates to maintain. Drawn entirely in SVG, no assets, no canvas.
 *
 * Everything sits behind the lineup and in front of the floor, and nothing here is
 * interactive: it is set dressing that tells you what the stakes are.
 */

/** Deterministic PRNG, so a given case always lays out the same way. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOOD = "#5e0f12";
const BLOOD_WET = "#7a1418";
const BLOOD_DRY = "#3e0a0d";
const INK = "#1c1613";

/**
 * The victim.
 *
 * Drawn as a person in the same vocabulary as the suspects standing over her, because a
 * dark mass under a chalk outline reads as a shadow and does no work. She is face up, one
 * arm thrown out into her own blood, the other folded under. Eyes closed rather than
 * cartoon crosses: this is the reason everyone in the room is being questioned, and it
 * should land as a body rather than as a joke.
 */
/** An irregular blob, so nothing reads as a circle someone drew with a tool. */
function blob(r: () => number, cx: number, cy: number, rad: number, points = 11) {
  const pts: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = rad * (0.62 + r() * 0.55);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr * 0.58).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

function Victim({ x, y, left }: { x: number; y: number; left: boolean }) {
  const SKIN = "#e8bb96";
  const DRESS = "#5c4a63";
  const DRESS_DARK = "#4a3a51";
  const HAIR = "#3a2a22";
  const flip = left ? 1 : -1;

  /** A limb: one thick ink stroke for the outline, a thinner fill laid over it. */
  const limb = (d: string, w: number, fill: string) => (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );

  return (
    <g transform={`translate(${x} ${y}) scale(${0.3 * flip} 0.3) rotate(-4)`}>
      {/* the far leg, folded under, drawn first so the near one reads as on top */}
      {limb("M-4 -4 L-19 -12 L-31 -14", 11, DRESS_DARK)}
      <ellipse cx="-34" cy="-15" rx="6" ry="4.5" fill="#241c17" stroke={INK} strokeWidth="2.2" transform="rotate(-26 -34 -15)" />

      {/* the far arm, thrown out above her head */}
      {limb("M15 -9 L8 -24 L17 -33", 9, DRESS_DARK)}
      <circle cx="20" cy="-36" r="5.4" fill={SKIN} stroke={INK} strokeWidth="2.2" />

      {/* the near leg */}
      {limb("M-4 5 L-22 7 L-37 12", 11, DRESS)}
      <ellipse cx="-40" cy="13" rx="6" ry="4.5" fill="#241c17" stroke={INK} strokeWidth="2.2" transform="rotate(16 -40 13)" />

      {/* torso */}
      <path
        d="M20 -11 Q24 0 20 11 L-5 9 Q-9 0 -5 -9 Z"
        fill={DRESS}
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* a fold in the coat, so the torso is not one flat slab */}
      <path d="M8 -8 Q5 0 8 8" fill="none" stroke={INK} strokeWidth="1.6" opacity="0.35" />

      {/* the near arm, fallen across into her own blood */}
      {limb("M15 9 L3 21 L-9 24", 9, DRESS)}
      <circle cx="-13" cy="25" r="5.4" fill={SKIN} stroke={INK} strokeWidth="2.2" />
      <path d="M-16 21 l-3 -3 M-18 25 l-4 1 M-16 29 l-2 3" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {/* neck */}
      <path d="M20 -6 L28 -5 L28 5 L20 6 Z" fill={SKIN} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />

      {/* head, fallen to one side */}
      <g transform="translate(37 1) rotate(16)">
        {/* hair spread on the floor, behind the face */}
        <path
          d="M2 -11 Q16 -17 20 -4 Q23 8 12 14 Q19 3 13 -3 Q8 -9 2 -11 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M-2 -12 Q-14 -14 -18 -4 Q-11 -8 -3 -7 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <ellipse cx="0" cy="0" rx="10.5" ry="11.5" fill={SKIN} stroke={INK} strokeWidth="2.4" />
        {/* hairline over the top of the face */}
        <path
          d="M-10.5 -3 Q-9 -13 0 -13 Q9 -13 10.5 -3 Q6 -8 0 -8 Q-6 -8 -10.5 -3 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* eyes crossed out, mouth slack open */}
        <g stroke={INK} strokeWidth="2.1" strokeLinecap="round">
          <path d="M-7.4 -2.6 l4.4 4.4 M-3 -2.6 l-4.4 4.4" />
          <path d="M3 -2.6 l4.4 4.4 M7.4 -2.6 l-4.4 4.4" />
        </g>
        <ellipse cx="0" cy="6.6" rx="2.4" ry="1.8" fill="#5b2b2b" stroke={INK} strokeWidth="1.6" />
      </g>
    </g>
  );
}

export function CrimeScene({ variant, suspects }: { variant: number; suspects: number }) {
  const scene = useMemo(() => {
    const r = rng(variant * 7919 + 13);

    // The lineup stands across the middle of the room, so the body goes in one of the gaps
    // between them. Placed anywhere else it ends up behind a suit, and a body you cannot
    // see is set dressing that does no work.
    const span = (i: number) => (19 + (suspects === 1 ? 50 : (i / (suspects - 1)) * 62)) * 1.6;
    const gaps: number[] = [];
    for (let i = 0; i < suspects - 1; i++) gaps.push((span(i) + span(i + 1)) / 2);
    if (gaps.length === 0) gaps.push(80);

    // She lies in front of the lineup, in the pool of light, rather than behind it.
    //
    // Tucked into a gap between suspects she was legible in a four-man case and hidden
    // behind a shoulder in an eight-man one, which is the wrong thing to leave to chance.
    // Downstage of everyone's feet she is always visible and always lit, and the men are
    // standing over her instead of in front of her.
    const bodyX = gaps[Math.floor(r() * gaps.length)];
    const left = bodyX < 80;
    const bodyY = 66 + r() * 2;
    const exitX = left ? 6 + r() * 14 : 154 - r() * 14;

    const pool = blob(r, bodyX + (r() < 0.5 ? 1.5 : -1.5), bodyY + 1.5, 7 + r() * 2);

    // Spatter: a scatter of small stains, denser near the body.
    const spatter = Array.from({ length: 8 + Math.floor(r() * 5) }, () => {
      const spread = 10 + r() * 22;
      const x = bodyX + (r() - 0.5) * spread * 2;
      const y = bodyY + (r() - 0.5) * spread * 0.34;
      return { d: blob(r, x, y, 0.7 + r() * 1.9, 8), o: 0.3 + r() * 0.36 };
    });

    // Prints walking out of the pool and straight past you, growing as they come forward and
    // fading as the blood wears off the shoe.
    const steps = 9;
    const prints = Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      const ease = t * t; // the floor recedes, so steps bunch up toward the back wall
      return {
        x: bodyX + (exitX - bodyX) * t,
        y: bodyY + 2 + ease * 12,
        side: i % 2 === 0 ? -1 : 1,
        rot: (left ? -8 : 8) + (r() - 0.5) * 12,
        o: Math.max(0.1, 0.8 - t * 0.55),
        s: 0.5 + ease * 1.5,
      };
    });

    // His signature on the wall, directly above the body. That is where he leaves it.
    const markX = Math.max(24, Math.min(102, bodyX + (left ? 16 : -16) + (r() - 0.5) * 8));

    return { bodyX, bodyY, pool, spatter, prints, markX, left };
  }, [variant, suspects]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {/* ── his signature, on the back wall above the body ── */}
      <g
        transform={`translate(${scene.markX} 27) scale(0.95)`}
        opacity={0.5}
        style={{ filter: "blur(0.12px)" }}
      >
        <circle cx="0" cy="0" r="7.2" fill="none" stroke={BLOOD_DRY} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M-3.4 -2.6 l0 0" stroke={BLOOD_DRY} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M3.4 -2.6 l0 0" stroke={BLOOD_DRY} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M-4 2.2 Q0 6.4 4 2.2" fill="none" stroke={BLOOD_DRY} strokeWidth="1.5" strokeLinecap="round" />
        {/* the drip, because it was painted with fingers and it ran */}
        <path d="M5.6 4.2 q0.5 3.4 -0.2 6.2" stroke={BLOOD_DRY} strokeWidth="0.7" fill="none" opacity="0.75" />
      </g>

      {/* ── spatter ── */}
      {scene.spatter.map((sp, i) => (
        <path key={i} d={sp.d} fill={BLOOD} opacity={sp.o} />
      ))}

      {/* ── the pool ── */}
      <path d={scene.pool} fill={BLOOD} opacity={0.88} />
      <g transform={`translate(${scene.bodyX} ${scene.bodyY + 2.5}) scale(0.66) translate(${-scene.bodyX} ${-(scene.bodyY + 2.5)})`}>
        <path d={scene.pool} fill={BLOOD_WET} opacity={0.35} />
      </g>

      {/* ── the victim ── */}
      <ellipse
        cx={scene.bodyX}
        cy={scene.bodyY + 2.2}
        rx="13"
        ry="2.6"
        fill="#000"
        opacity="0.42"
      />
      <Victim x={scene.bodyX} y={scene.bodyY} left={scene.left} />

      {/* ── prints walking out ──
          A shoe, not a pill. The old pair of stacked ovals read as a red capsule lying on
          the floor: no toe, no arch, no heel, and nothing to say which way it was going.
          A sole narrows at the waist and the heel sits apart from it, which is most of what
          makes a print legible at this size. Left and right alternate about the line of
          travel and the whole foot points along it. */}
      {scene.prints.map((p, i) => (
        <g
          key={i}
          transform={`translate(${p.x} ${p.y + p.side * 1.6}) rotate(${p.rot + p.side * 6}) scale(${p.s * 0.9})`}
          opacity={p.o}
        >
          <g transform={`scale(${p.side} 1)`}>
            {/* sole: broad across the ball of the foot, pinched at the waist */}
            <path
              d="M-0.95 -2.9 C-1.35 -1.9 -1.25 -0.7 -0.75 0.05 C-0.35 0.65 0.35 0.65 0.7 0.05 C1.15 -0.7 1.2 -1.95 0.85 -2.9 C0.5 -3.75 -0.6 -3.8 -0.95 -2.9 Z"
              fill={BLOOD_WET}
            />
            {/* heel, set back and slightly narrower */}
            <ellipse cx="-0.05" cy="1.75" rx="0.72" ry="0.95" fill={BLOOD_WET} />
          </g>
        </g>
      ))}

    </svg>
  );
}
