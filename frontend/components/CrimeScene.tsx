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
function Victim({ x, y, left }: { x: number; y: number; left: boolean }) {
  const SKIN = "#e8bb96";
  const DRESS = "#4a3f52";
  const HAIR = "#3a2a22";
  const flip = left ? 1 : -1;

  return (
    <g transform={`translate(${x} ${y}) scale(${0.26 * flip} 0.26) rotate(-6)`}>
      {/* the leg that folded under, drawn first so the dress hem covers the hip */}
      <path d="M2 4 q16 6 27 2 l2 7 q-14 6 -31 -2 Z" fill={DRESS} stroke={INK} strokeWidth="1.6" />
      <path d="M26 5 q13 -3 21 -9 l4 6 q-9 7 -23 10 Z" fill={DRESS} stroke={INK} strokeWidth="1.6" />
      {/* shoes */}
      <ellipse cx="50" cy="-4" rx="5" ry="3.4" fill="#241c17" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="30" cy="12" rx="5" ry="3.4" fill="#241c17" stroke={INK} strokeWidth="1.5" />

      {/* torso, lying on its back and slightly turned */}
      <path
        d="M-22 -4 q6 -12 20 -11 q14 -1 20 8 q2 6 -2 10 q-16 6 -34 1 Z"
        fill={DRESS}
        stroke={INK}
        strokeWidth="1.8"
      />
      {/* collar */}
      <path d="M-19 -9 q6 5 13 4" fill="none" stroke={INK} strokeWidth="1.4" opacity="0.6" />

      {/* the arm thrown out into the pool */}
      <path
        d="M-8 -12 q6 -14 18 -19 l5 5 q-11 5 -16 17 Z"
        fill={DRESS}
        stroke={INK}
        strokeWidth="1.6"
      />
      <circle cx="13" cy="-31" r="4.6" fill={SKIN} stroke={INK} strokeWidth="1.6" />
      {/* fingers, slightly open */}
      <path d="M15 -35 l3 -3 M17 -31 l4 -1 M16 -28 l3 2" stroke={INK} strokeWidth="1.2" fill="none" />

      {/* the other arm, folded across */}
      <path d="M-16 -6 q-9 4 -14 12 l5 4 q6 -8 13 -10 Z" fill={DRESS} stroke={INK} strokeWidth="1.6" />
      <circle cx="-31" cy="8" r="4.2" fill={SKIN} stroke={INK} strokeWidth="1.6" />

      {/* head, turned away from you */}
      <g transform="translate(-31 -14) rotate(-24)">
        <ellipse cx="0" cy="0" rx="9.5" ry="10.5" fill={SKIN} stroke={INK} strokeWidth="1.8" />
        {/* hair, spread on the floor */}
        <path
          d="M-10 -3 q-2 -12 10 -12 q12 0 10 12 q-3 -6 -10 -6 q-7 0 -10 6 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="1.6"
        />
        <path d="M-9 -2 q-9 4 -13 12 q6 -2 9 -6" fill={HAIR} stroke={INK} strokeWidth="1.5" />
        <path d="M9 -2 q8 5 11 13 q-6 -2 -9 -7" fill={HAIR} stroke={INK} strokeWidth="1.5" />
        {/* closed eyes and a slack mouth */}
        <path d="M-5.5 1 q2 2 4 0" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M1.5 1 q2 2 4 0" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M-1 6 q1.5 1 3 0" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </g>
  );
}

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

    const pool = blob(r, bodyX - 2, bodyY + 1.2, 6.5 + r() * 2);

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

      {/* ── prints walking out ── */}
      {scene.prints.map((p, i) => (
        <g
          key={i}
          transform={`translate(${p.x} ${p.y + p.side * 1.5}) rotate(${p.rot}) scale(${p.s})`}
          opacity={p.o}
        >
          <ellipse cx="0" cy="0" rx="0.95" ry="1.9" fill={BLOOD_WET} />
          <ellipse cx="0" cy="-2.4" rx="0.7" ry="0.8" fill={BLOOD_WET} />
        </g>
      ))}

      {/* ── evidence markers ── */}
      {[0, 1].map((i) => {
        const x = scene.bodyX + (scene.left ? 12 + i * 10 : -12 - i * 10);
        const y = scene.bodyY + 3 + i * 4;
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${0.62 + i * 0.12})`}>
            {/* the shadow is what puts it on the floor rather than in the air */}
            <ellipse cx="3" cy="0.4" rx="4.2" ry="1.1" fill="#000" opacity="0.4" />
            {/* a folded card, so it has a lit face and a shaded one */}
            <path d="M0 0 l3 -6 l3 6 Z" fill="#e8c34a" stroke="#8a6f16" strokeWidth="0.25" />
            <path d="M3 -6 l3 6 l-1.4 0 l-1.6 -6 Z" fill="#c9a534" />
            <text
              x="2.4"
              y="-1.1"
              fontSize="2.7"
              textAnchor="middle"
              fill="#2a2008"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
