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

  /**
   * A limb: one thick ink stroke for the outline, a thinner fill laid over it.
   *
   * The hand or foot at the end of it goes in *before* the limb, so the sleeve or hem
   * overlaps it. Drawn after, its own outline cuts across the end of the limb and the
   * extremity reads as a ball parked next to an arm rather than as the end of one.
   */
  const limb = (d: string, w: number, fill: string, end?: React.ReactNode) => (
    <>
      {end}
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );

  /**
   * She has fallen, not been arranged.
   *
   * The old pose put every joint at a right angle and threw all four limbs out flat, which
   * reads as a doll dropped from a height. A body that has gone down and stopped settles:
   * the hips roll a little to one side, the knees come up and stay bent, the shoulders lag
   * behind the hips, the arms fall wherever gravity leaves them, and the head lolls with
   * the chin toward the shoulder. Everything below is one of those.
   */
  return (
    // The inner translate is what actually centres her.
    //
    // She is drawn outward from her hips, but her mass is not symmetrical about them: head
    // and shoulders run one way, legs the other. Anchoring the hips to the middle of the
    // room therefore left the *figure* sitting off to one side of it. Shifting the drawing
    // back by half its own width puts what you can see in the centre, and because the shift
    // happens inside the flip it works whichever way she is lying.
    <g transform={`translate(${x} ${y}) scale(${0.34 * flip} 0.34) rotate(-6) translate(-5.2 0)`}>
      {/* Far leg, underneath and mostly hidden by the near one: straight out, foot turned
          over the way a leg lands when nothing is holding it. */}
      {limb(
        "M-7 -2 Q-22 -5 -34 -6",
        9,
        DRESS_DARK,
        <ellipse cx="-38" cy="-7" rx="5" ry="3.6" fill="#241c17" stroke={INK} strokeWidth="2.2" transform="rotate(-22 -38 -7)" />,
      )}

      {/* Near leg: knee fallen open, foot rolled outward. The gap between the two legs is
          what stops the lower half reading as one shape. */}
      {limb(
        "M-7 6 Q-21 11 -33 12",
        10,
        DRESS,
        <ellipse cx="-37" cy="13" rx="5.2" ry="3.8" fill="#241c17" stroke={INK} strokeWidth="2.2" transform="rotate(16 -37 13)" />,
      )}

      {/* Torso. Narrower at the waist and tipped, so the shoulders lag behind the hips
          instead of lying square to them. */}
      <path
        d="M18 -10 Q23 -1 19 10 Q6 13 -6 9 Q-10 1 -6 -8 Q4 -12 18 -10 Z"
        fill={DRESS}
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* The coat gathers where her weight has rolled onto one hip. */}
      <path d="M6 -8 Q2 1 6 9" fill="none" stroke={INK} strokeWidth="1.5" opacity="0.32" />
      <path d="M-2 -6 Q-5 1 -2 7" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.2" />

      {/* The one arm that shows. Her other is under her, which is where a rolled shoulder
          puts it, and drawing it anyway was half the reason the figure read as a heap.
          This one has come to rest out in her own blood, elbow bent, fingers open. */}
      // Thinner than a leg and pointed a different way — down toward the camera rather than
      // off along the same axis as her legs. Matched in weight and direction to them, it
      // read as a third leg coming out of her hip.
      {limb(
        "M14 9 Q16 20 10 28",
        6,
        DRESS,
        <>
          <circle cx="9" cy="33.5" r="4.2" fill={SKIN} stroke={INK} strokeWidth="2.2" />
          <path
            d="M6 31.4 l-2.6 -1.4 M5.2 34.6 l-3.4 0.4 M7.4 37 l-1.4 2.6"
            stroke={INK}
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </>,
      )}

      {/* Neck, short and angled: the head has rolled, it has not been set down straight. */}
      <path d="M17 -6 L25 -6 L26 4 L18 5 Z" fill={SKIN} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />

      {/* Head, chin fallen toward her shoulder. Smaller than it was — the old one was nearly
          as wide as the torso, which is what made the whole figure read as a rag doll. */}
      <g transform="translate(32 0) rotate(24)">
        {/* hair spread out on the floor under her, drawn behind the face */}
        <path
          d="M1 -9 Q14 -14 17 -3 Q19 7 10 12 Q16 2 11 -2 Q7 -7 1 -9 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M-2 -10 Q-13 -12 -16 -3 Q-10 -7 -3 -6 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <ellipse cx="0" cy="0" rx="8.6" ry="9.4" fill={SKIN} stroke={INK} strokeWidth="2.3" />
        {/* hairline over the top of the face */}
        <path
          d="M-8.6 -2.4 Q-7.4 -10.6 0 -10.6 Q7.4 -10.6 8.6 -2.4 Q4.8 -6.6 0 -6.6 Q-4.8 -6.6 -8.6 -2.4 Z"
          fill={HAIR}
          stroke={INK}
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        {/* Eyes closed, mouth slightly open. Crossed-out eyes are a cartoon gag, and this is
            the reason every person in the room is being questioned. */}
        <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none">
          <path d="M-6.4 -1 Q-4.2 1.2 -2 -1" />
          <path d="M2 -1 Q4.2 1.2 6.4 -1" />
        </g>
        <ellipse cx="0.4" cy="5.4" rx="1.9" ry="1.5" fill="#5b2b2b" stroke={INK} strokeWidth="1.4" />
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
    // Centre of the room, every case.
    //
    // She used to be dealt into a random gap in the lineup, which put her under somebody's
    // name tag as often as not and made the composition different for no reason each time.
    // The room is symmetrical and the light hangs over the middle of it: that is where the
    // camera is looking, so that is where she is.
    const bodyX = 80;
    // Which way she is lying, and therefore which way the killer walked out. Alternated by
    // case rather than derived from her position, which is now the same in every room.
    const left = variant % 2 === 0;
    // Lifted with the lineup. Everything downstream — the pool, the spatter and the prints
    // walking out — is measured from here, so the whole scene travels together.
    const bodyY = 62 + r() * 2;

    const pool = blob(r, bodyX + (r() < 0.5 ? 1.5 : -1.5), bodyY + 1.5, 7 + r() * 2);

    // Spatter: a scatter of small stains, denser near the body.
    const spatter = Array.from({ length: 8 + Math.floor(r() * 5) }, () => {
      const spread = 10 + r() * 22;
      const x = bodyX + (r() - 0.5) * spread * 2;
      const y = bodyY + (r() - 0.5) * spread * 0.34;
      return { d: blob(r, x, y, 0.7 + r() * 1.9, 8), o: 0.3 + r() * 0.36 };
    });

    // Prints walking out of the pool and past you, growing as they come forward and fading
    // as the blood wears off the shoe.
    //
    // They used to run at the far wall — `exitX` put them out at the edge of the room, so
    // the trail crossed the frame sideways and the last print ended up off the screen
    // entirely, at three times the length of a foot, because the growth curve had nothing
    // stopping it. He walks out past the camera instead: a short lateral drift and a lot of
    // downward travel, which is what "toward you" looks like in a faked perspective.
    const out = left ? -1 : 1;
    const px = (t: number) => bodyX + out * (5 + t * 17);
    const py = (t: number) => bodyY + 5 + t * 27;

    const steps = 8;
    const prints = Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      const ease = t * t; // the floor recedes, so steps bunch up toward the back wall

      // Point each foot along the direction of travel.
      //
      // These used to carry a fixed rotation near zero, which left every toe pointing
      // straight up the screen while the trail itself ran sideways: a line of feet walking
      // away from the direction they were facing. The sole is drawn toe-up, so rotating by
      // atan2(dx, -dy) turns that default heading onto the tangent of the path.
      const dx = px(Math.min(1, t + 0.02)) - px(Math.max(0, t - 0.02));
      const dy = py(Math.min(1, t + 0.02)) - py(Math.max(0, t - 0.02));
      const heading = (Math.atan2(dx, -dy) * 180) / Math.PI;

      return {
        x: px(t),
        y: py(t),
        side: i % 2 === 0 ? -1 : 1,
        // A few degrees of toe-out per foot, because nobody walks with their feet parallel.
        rot: heading + (r() - 0.5) * 7,
        o: Math.max(0.12, 0.72 - t * 0.5),
        // A shoe is about a fifth the length of the person lying next to it, so this is
        // capped rather than left to run: it used to reach 1.8 and print a boot the size of
        // her torso in the foreground.
        s: 0.55 + ease * 0.55,
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
      {/* ── his signature, on the back wall above the body ──
          The same photograph the title, the cold open and the unmasking use. Every room in
          the game is supposed to have been signed by one hand, and four hand-drawn versions
          of a face is four hands. Held back off the wall by opacity and a hair of blur: it
          is paint that dried days ago under a bad light, not a decal. */}
      <image
        href="/brand/redjohn.png"
        x={scene.markX - 8.5}
        y={17.5}
        width="17"
        height="24.3"
        opacity={0.42}
        preserveAspectRatio="xMidYMid meet"
        style={{ filter: "blur(0.12px) saturate(0.75) brightness(0.85)" }}
      />

      {/* ── spatter ── */}
      {scene.spatter.map((sp, i) => (
        <path key={i} d={sp.d} fill={BLOOD} opacity={sp.o} />
      ))}

      {/* ── the trail. Drawn before the body and the blood it lies in, because it is on the
          floor and they are on top of it. Painted last, the prints walked over the victim. */}
      {/* ── prints walking out ──
          A shoe, not a pill. The old pair of stacked ovals read as a red capsule lying on
          the floor: no toe, no arch, no heel, and nothing to say which way it was going.
          A sole narrows at the waist and the heel sits apart from it, which is most of what
          makes a print legible at this size. Left and right alternate about the line of
          travel and the whole foot points along it. */}
      {scene.prints.map((p, i) => (
        <g
          key={i}
          transform={`translate(${p.x} ${p.y}) rotate(${p.rot + p.side * 5}) translate(${p.side * 1.7} 0) scale(${p.s * 0.62})`}
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

      
    </svg>
  );
}
