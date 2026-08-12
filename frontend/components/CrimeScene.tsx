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

    // He lies at the back of the room on the floor under the wall. Whoever did it walked
    // out toward the camera.
    const bodyX = gaps[Math.floor(r() * gaps.length)];
    const left = bodyX < 80;
    const bodyY = 53 + r() * 3;
    const exitX = left ? 8 + r() * 16 : 152 - r() * 16;

    const pool = blob(r, bodyX, bodyY + 1.6, 8 + r() * 2.5);

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
        x: bodyX + (exitX - bodyX) * ease,
        y: bodyY + 3 + ease * 40,
        side: i % 2 === 0 ? -1 : 1,
        rot: (left ? -8 : 8) + (r() - 0.5) * 12,
        o: Math.max(0.1, 0.8 - t * 0.55),
        s: 0.5 + ease * 1.5,
      };
    });

    // His signature on the wall, directly above the body. That is where he leaves it.
    const markX = Math.max(22, Math.min(104, bodyX + (left ? 14 : -14) + (r() - 0.5) * 8));

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

      {/* ── the body ── */}
      <g transform={`translate(${scene.bodyX} ${scene.bodyY}) rotate(${scene.left ? -8 : 8}) scale(0.62)`}>
        {/* torso, lying on its side */}
        <ellipse cx="0" cy="0" rx="11" ry="3.6" fill="#151115" />
        <ellipse cx="0" cy="-0.7" rx="10.4" ry="2.9" fill="#221b22" />
        {/* head, turned away */}
        <circle cx={scene.left ? -12.4 : 12.4} cy="-0.9" r="3.5" fill="#2c242b" />
        <circle cx={scene.left ? -13.2 : 13.2} cy="-1.8" r="2.4" fill="#38303a" opacity="0.7" />
        {/* an arm thrown out, and a leg folded under */}
        <path
          d={scene.left ? "M6 0.6 q6.6 2.7 10.6 0.9" : "M-6 0.6 q-6.6 2.7 -10.6 0.9"}
          stroke="#221b22"
          strokeWidth="2.7"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={scene.left ? "M7.6 -1.4 q5.8 -2.3 9.4 -0.6" : "M-7.6 -1.4 q-5.8 -2.3 -9.4 -0.6"}
          stroke="#1b161b"
          strokeWidth="2.3"
          strokeLinecap="round"
          fill="none"
        />
        {/* the sheet, drawn up but not over the face */}
        <path d="M-9 -2.4 q9 -3.4 18 0 l0 3 q-9 -2.9 -18 0 Z" fill="#463c44" opacity="0.6" />
        {/* chalk. A dark shape on a dark floor is a stain; an outline is a person. */}
        <g fill="none" stroke="#d8d2c4" strokeWidth="0.6" opacity="0.42" strokeLinecap="round">
          <ellipse cx="0" cy="0" rx="12.4" ry="4.8" />
          <circle cx={scene.left ? -12.4 : 12.4} cy="-0.9" r="4.4" />
          <path d={scene.left ? "M6 1.4 q7.4 3.4 11.8 1.4" : "M-6 1.4 q-7.4 3.4 -11.8 1.4"} />
        </g>
      </g>

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
        const x = scene.bodyX + (scene.left ? 20 + i * 15 : -20 - i * 15);
        const y = scene.bodyY + 6 + i * 9;
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${1 + i * 0.25})`} opacity="0.62">
            <path d="M0 0 l2.6 -5.2 l2.6 5.2 Z" fill="#cdc6b6" />
            <text x="2.6" y="-1" fontSize="2.5" textAnchor="middle" fill="#2a2420" fontFamily="monospace">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
