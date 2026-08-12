"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Character, type Expression, type Idle } from "./Character";
import { CrimeScene } from "./CrimeScene";
import type { Suspect } from "@/lib/suspects";

/**
 * THE ROOM.
 *
 * The scene the game is actually set in, rather than a grid of cards that represents one.
 * Everything here is drawn with SVG and CSS, no canvas, no WebGL, no assets, because the
 * whole app has to stay something a judge can open instantly on a cold browser.
 *
 * Three things do the heavy lifting:
 *
 *   1. **Faked depth.** A vanishing point at the back wall, a receding floor, and suspects
 *      scaled and lifted along a shallow arc. Real 3D perspective on DOM elements fights
 *      you constantly; a hand-tuned 2D fake reads better and never breaks layout.
 *   2. **One practical light.** A single hanging lamp with a cone and a floor pool. Because
 *      there is exactly one source, every shadow agrees with it, which is most of what
 *      makes a flat scene look lit.
 *   3. **A camera.** Focusing a suspect translates and scales the whole scene toward them
 *      while the rest fall into shadow, the push-in is what turns a lineup into an
 *      interrogation.
 */

export interface RoomSubject {
  suspect: Suspect;
  expression: Expression;
  cleared: boolean;
  liar: boolean;
  honest: boolean;
  inQuestion: boolean;
  turned: boolean;
  /** What they're saying right now, rendered as a bubble over their head. */
  saying?: { line: string; answer: boolean } | null;
  /** What they do when nobody is questioning them. */
  idle?: Idle;
}

/**
 * Where each figure stands.
 *
 * Positioned by the **feet**, not the head, they are standing on a floor, and anchoring by
 * the baseline is the only way the contact shadows land where the light says they should.
 * The lineup bows: the middle of the room is further from camera, so those figures sit
 * higher on screen and smaller, which is what sells the depth.
 */
function placement(i: number, n: number) {
  const t = n === 1 ? 0.5 : i / (n - 1); // 0..1 across the room
  const bow = Math.sin(t * Math.PI); // 0 at the ends, 1 in the middle

  return {
    // Held well inside the frame: at full bleed the old 10..90 spread ran the end figures
    // off both edges, and a lineup with its outermost men cropped reads as a bug.
    x: 19 + t * 62,
    /** Percent up from the bottom of the scene, further back stands higher. */
    bottom: 26 + bow * 8,
    scale: 1 - bow * 0.24,
    /** Painter's algorithm, nearer figures draw over further ones. */
    z: Math.round((1 - bow) * 100),
  };
}

/**
 * Figure width as a share of the scene.
 *
 * Deliberately small. These men are standing at the back of a room you are looking into,
 * not posing for a lineup photograph, and the crime scene in the foreground needs the space
 * more than they do. Capped so a four-man case does not balloon.
 */
function baseWidth(n: number) {
  return Math.max(4.6, Math.min(7.4, 58 / n));
}

/**
 * What each room is made of.
 *
 * Every case names its own setting, and a shuttered parlour should not look like a mall
 * food court lit by strip lights. These are the two or three colours that actually change
 * the read of a space: the wall, the floor, and what the one practical light is doing.
 */
const ROOMS = [
  // a shuttered Sunday parlour: warm, papered, domestic
  { wall: ["#241b1d", "#2c2124", "#38292c"], floor: ["#38292c", "#241b1d", "#160f11"], lamp: "#ffe9b8", grid: "#6b5a60" },
  // a shuttered safe house: cold, institutional, damp
  { wall: ["#171d22", "#1c242a", "#263139"], floor: ["#263139", "#192126", "#0f1519"], lamp: "#cfe3ef", grid: "#5f7684" },
  // a half dead mall food court: sick custard strip lighting
  { wall: ["#1f2018", "#26281d", "#333524"], floor: ["#333524", "#212318", "#14150e"], lamp: "#fff3c4", grid: "#7b7f5c" },
  // a shuttered hotel lounge: green baize and old brass
  { wall: ["#161f1b", "#1b2721", "#24332b"], floor: ["#24332b", "#17211c", "#0e1512"], lamp: "#f6e2b0", grid: "#5d7a6c" },
  // a dance hall's dirt cellar: earth and low red
  { wall: ["#20191a", "#291f1e", "#352725"], floor: ["#352725", "#221a19", "#140f0e"], lamp: "#ffd9a8", grid: "#6f5a52" },
  // the parlour where it happened: ten years of dust
  { wall: ["#1d1b22", "#242229", "#2f2b35"], floor: ["#2f2b35", "#1e1c23", "#121016"], lamp: "#ffe9b8", grid: "#6b6270" },
  // a chapel beside the graves: stone and candlelight
  { wall: ["#1c1a1e", "#232128", "#2e2b33"], floor: ["#2e2b33", "#1d1b21", "#111014"], lamp: "#ffdca6", grid: "#6d6875" },
] as const;

export function Room({
  subjects,
  focused,
  onFocus,
  onToggle,
  disabled,
  variant = 0,
}: {
  subjects: RoomSubject[];
  /** Seat the camera is pushed in on, or null for the wide shot. */
  focused: number | null;
  onFocus: (seat: number) => void;
  onToggle: (seat: number) => void;
  disabled: boolean;
  /** Which crime scene to lay out. One per case. */
  variant?: number;
}) {
  const n = subjects.length;
  const room = ROOMS[variant % ROOMS.length]!;
  const spots = useMemo(() => subjects.map((_, i) => placement(i, n)), [subjects, n]);
  const w = baseWidth(n);

  // Camera: push toward the focused figure. Kept gentle, a hard zoom loses the room, and
  // in a small lineup the figures are already large, so the push scales down with the count.
  const target = focused !== null ? spots[focused] : null;
  const zoom = n <= 5 ? 1.1 : n <= 7 ? 1.18 : 1.24;

  // Clamp the pan to the actual overflow the zoom creates. Scaling by z gives (z-1)/2 of
  // slack on each side; panning further than that walks a figure off the edge of the frame,
  // which is exactly what a four-person lineup was doing to whoever stood on the far right.
  const slack = ((zoom - 1) / 2) * 100;
  const wanted = target ? (50 - target.x) * 0.42 : 0;
  const pan = Math.max(-slack, Math.min(slack, wanted));

  const camera = target
    ? { x: `${pan}%`, y: "-1%", scale: zoom }
    : { x: "0%", y: "0%", scale: 1 };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d0c0e]">
      <motion.div
        className="absolute inset-0"
        animate={camera}
        transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.5 }}
      >
        {/* ── back wall ── */}
        <div
          className="absolute inset-x-0 top-0 h-[54%]"
          style={{
            background: `linear-gradient(${room.wall[0]} 0%, ${room.wall[1]} 55%, ${room.wall[2]} 100%)`,
          }}
        >
          {/* tiled wall, receding */}
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage: `linear-gradient(90deg, ${room.grid} 1px, transparent 1px), linear-gradient(${room.grid} 1px, transparent 1px)`,
              backgroundSize: "7% 22%",
            }}
          />
          {/* the one-way mirror */}
          <div
            className="absolute right-[8%] top-[22%] h-[38%] w-[21%]"
            style={{
              background:
                "linear-gradient(148deg, rgb(88 96 118 / 0.26) 0%, rgb(24 27 34 / 0.5) 42%, rgb(14 17 23 / 0.62) 100%)",
              border: "3px solid rgb(58 52 64 / 0.9)",
              boxShadow:
                "inset 0 0 50px rgb(0 0 0 / 0.7), inset 0 2px 0 rgb(150 142 164 / 0.10), 0 0 22px rgb(0 0 0 / 0.4)",
            }}
          >
            {/* the sheen across the glass */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(118deg, transparent 34%, rgb(196 204 226 / 0.07) 44%, transparent 52%)",
              }}
            />
          </div>
        </div>

        {/* ── floor ── */}
        <div
          className="absolute inset-x-0 bottom-0 h-[46%]"
          style={{
            background: `linear-gradient(${room.floor[0]} 0%, ${room.floor[1]} 40%, ${room.floor[2]} 100%)`,
          }}
        >
          {/* perspective boards converging on the vanishing point */}
          <svg className="absolute inset-0 h-full w-full opacity-25" preserveAspectRatio="none" aria-hidden>
            {Array.from({ length: 15 }, (_, i) => (
              <line
                key={i}
                x1={`${(i / 14) * 100}%`}
                y1="100%"
                x2={`${44 + (i / 14) * 12}%`}
                y2="0%"
                stroke={room.grid}
                strokeWidth="1"
              />
            ))}
            {[12, 28, 48, 72].map((y) => (
              <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke={room.grid} strokeWidth="1" />
            ))}
          </svg>
        </div>

        {/* ── the practical: one hanging lamp ── */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
          <div className="mx-auto h-[8%] w-[2px] bg-[#3a343f]" />
          <div
            className="mx-auto h-5 w-16"
            style={{
              background: "linear-gradient(#4a434f, #2b262f)",
              clipPath: "polygon(18% 0, 82% 0, 100% 100%, 0 100%)",
              border: "1px solid #554e5c",
            }}
          />
          <div className="mx-auto -mt-1 h-2.5 w-7 rounded-full blur-[2px]" style={{ background: room.lamp }} />
        </div>

        {/* light cone */}
        <div
          className="pointer-events-none absolute left-1/2 top-[10%] -translate-x-1/2"
          style={{
            width: "68%",
            height: "78%",
            background:
              `linear-gradient(${room.lamp} 0%, rgb(255 233 184 / 0.10) 42%, transparent 78%)`,
            clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0 100%)",
            opacity: 0.3,
            filter: "blur(6px)",
          }}
        />

        <CrimeScene variant={variant} suspects={n} />

        {/* pool of light on the floor */}
        <div
          className="pointer-events-none absolute left-1/2 top-[56%] h-[30%] w-[66%] -translate-x-1/2 rounded-[50%]"
          style={{
            background: "radial-gradient(ellipse, rgb(255 231 178 / 0.20), transparent 68%)",
            filter: "blur(10px)",
          }}
        />

        {/* ── the lineup ── */}
        {subjects.map((s, i) => {
          const spot = spots[i];
          const isFocus = focused === s.suspect.seat;
          const dim = focused !== null && !isFocus;

          // Nobody squares up to the camera. Each of them is turned a few degrees, and the
          // ones out on the wings are angled inward, toward her, the way people standing
          // round something on the floor actually orient themselves. Mirroring alternate
          // figures stops the lineup reading as one man printed N times.
          const inward = spot.x < 50 ? 1 : -1;
          const turn = (1.5 + ((i * 7) % 5) * 0.9) * inward;
          const facing = i % 3 === 1 ? -1 : 1;

          return (
            <motion.button
              key={s.suspect.seat}
              type="button"
              disabled={disabled}
              onClick={() => onFocus(s.suspect.seat)}
              onDoubleClick={() => onToggle(s.suspect.seat)}
              aria-label={`${s.suspect.name}, ${s.suspect.role}`}
              className="group absolute cursor-pointer disabled:cursor-not-allowed"
              style={{
                left: `${spot.x}%`,
                bottom: `${spot.bottom}%`,
                width: `${w * spot.scale}%`,
                zIndex: spot.z + (s.saying ? 400 : isFocus ? 200 : 0),
                transform: `translateX(-50%) rotate(${turn}deg)`,
                transformOrigin: "50% 100%",
              }}
              animate={{
                opacity: s.saying ? 1 : s.cleared ? 0.3 : dim ? 0.45 : 1,
                y: isFocus ? -8 : 0,
                scale: isFocus ? 1.06 : 1,
                filter: s.saying ? "brightness(1)" : dim ? "brightness(0.5)" : "brightness(1)",
              }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
            >
              {/* contact shadow, thrown by the lamp above */}
              <div
                className="absolute bottom-[-2%] left-1/2 h-[6%] w-[80%] -translate-x-1/2 rounded-[50%]"
                style={{ background: "radial-gradient(ellipse, rgb(0 0 0 / 0.75), transparent 70%)" }}
              />

              {/* The name stays on, always. A room of strangers you have to hover to
                  identify is a room you cannot reason about. */}
              <span className="name-tag pointer-events-none absolute -bottom-[13%] left-1/2 -translate-x-1/2 whitespace-nowrap border border-ink-3 bg-ink/90 px-1.5 py-[1px] font-mono text-[7px] tracking-file text-bone">
                {s.suspect.name.toUpperCase()}
              </span>

              <Character
                spec={s.suspect.character}
                expression={s.expression}
                cleared={s.cleared}
                fullBody
                idle={s.idle}
                className="h-auto w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
                style={{ transform: `scaleX(${facing})` }}
              />

              {/* speech bubble, the line comes out of the person, not just the caption bar */}
              <AnimatePresence>
                {s.saying && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className="pointer-events-none absolute bottom-full left-1/2 z-[300] mb-2 -translate-x-1/2"
                    style={{ width: "260%" }}
                  >
                    <div
                      className="relative border-[2.5px] bg-[#f4ecd8] px-2.5 py-1.5 text-center"
                      style={{
                        borderColor: s.saying.answer ? "#a81c1c" : "#1c1613",
                        borderRadius: 14,
                        boxShadow: "3px 4px 0 rgb(0 0 0 / 0.55)",
                      }}
                    >
                      <p className="font-type text-[10px] leading-tight text-[#1c1613]">
                        &ldquo;{s.saying.line}&rdquo;
                      </p>
                      <span
                        className="font-mono text-[9px] tracking-file"
                        style={{ color: s.saying.answer ? "#a81c1c" : "#4a423a" }}
                      >
                        {s.saying.answer ? "YES" : "NO"}
                      </span>
                      <span
                        className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2"
                        style={{
                          borderLeft: "7px solid transparent",
                          borderRight: "7px solid transparent",
                          borderTop: `10px solid ${s.saying.answer ? "#a81c1c" : "#1c1613"}`,
                        }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* nameplate, only for the figure under the light */}
              <motion.div
                animate={{ opacity: isFocus ? 1 : 0, y: isFocus ? 0 : 6 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none absolute inset-x-0 -bottom-1 text-center"
              >
                <span className="whitespace-nowrap border border-brass/60 bg-ink/90 px-1.5 py-0.5 font-mono text-[8px] tracking-file text-brass">
                  {s.suspect.name.toUpperCase()}
                </span>
              </motion.div>

              {/* status pips */}
              <div className="pointer-events-none absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1">
                {s.inQuestion && (
                  <span className="border border-blood-hot bg-ink px-1 font-mono text-[7px] tracking-file text-blood-hot">
                    IN
                  </span>
                )}
                {s.liar && (
                  <span className="border border-blood-hot bg-ink px-1 font-mono text-[7px] tracking-file text-blood-hot">
                    LIAR
                  </span>
                )}
                {s.honest && (
                  <span className="border border-brass bg-ink px-1 font-mono text-[7px] tracking-file text-brass">
                    TRUE
                  </span>
                )}
                {s.turned && (
                  <span className="border border-blood-hot bg-blood-hot/20 px-1 font-mono text-[7px] tracking-file text-blood-hot">
                    TURNED
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}

        {/* dust in the beam, cheap, and it makes the light feel like it's in the air */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              className="mote absolute rounded-full bg-[#ffe9b8]"
              style={{
                left: `${30 + ((i * 37) % 42)}%`,
                top: `${12 + ((i * 23) % 62)}%`,
                width: i % 3 === 0 ? 2.5 : 1.5,
                height: i % 3 === 0 ? 2.5 : 1.5,
                opacity: 0.16 + (i % 4) * 0.05,
                animationDelay: `${i * 1.4}s`,
                animationDuration: `${13 + (i % 5) * 4}s`,
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* vignette, outside the camera so it never slides */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 46%, transparent 34%, rgb(6 5 8 / 0.72) 82%, rgb(6 5 8 / 0.95) 100%)",
        }}
      />
    </div>
  );
}
