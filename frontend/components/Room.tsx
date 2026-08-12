"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Character, type Expression } from "./Character";
import type { Suspect } from "@/lib/suspects";

/**
 * THE ROOM.
 *
 * The scene the game is actually set in, rather than a grid of cards that represents one.
 * Everything here is drawn with SVG and CSS — no canvas, no WebGL, no assets — because the
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
 *      while the rest fall into shadow — the push-in is what turns a lineup into an
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
  /** What they're saying right now — rendered as a bubble over their head. */
  saying?: { line: string; answer: boolean } | null;
}

/**
 * Where each figure stands.
 *
 * Positioned by the **feet**, not the head — they are standing on a floor, and anchoring by
 * the baseline is the only way the contact shadows land where the light says they should.
 * The lineup bows: the middle of the room is further from camera, so those figures sit
 * higher on screen and smaller, which is what sells the depth.
 */
function placement(i: number, n: number) {
  const t = n === 1 ? 0.5 : i / (n - 1); // 0..1 across the room
  const bow = Math.sin(t * Math.PI); // 0 at the ends, 1 in the middle

  return {
    x: 10 + t * 80,
    /** Percent up from the bottom of the scene — further back stands higher. */
    bottom: 17 + bow * 10,
    scale: 1 - bow * 0.26,
    /** Painter's algorithm — nearer figures draw over further ones. */
    z: Math.round((1 - bow) * 100),
  };
}

/**
 * Figure width as a share of the scene.
 *
 * Capped at 11 rather than scaling freely: a four-person lineup was rendering figures so
 * large that the camera push-in cropped their legs, which is worse than a slightly empty
 * room. Ten still fit without a scrum.
 */
function baseWidth(n: number) {
  return Math.max(6.5, Math.min(11, 80 / n));
}

export function Room({
  subjects,
  focused,
  onFocus,
  onToggle,
  disabled,
}: {
  subjects: RoomSubject[];
  /** Seat the camera is pushed in on, or null for the wide shot. */
  focused: number | null;
  onFocus: (seat: number) => void;
  onToggle: (seat: number) => void;
  disabled: boolean;
}) {
  const n = subjects.length;
  const spots = useMemo(() => subjects.map((_, i) => placement(i, n)), [subjects, n]);
  const w = baseWidth(n);

  // Camera: push toward the focused figure. Kept gentle — a hard zoom loses the room, and
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
    <div className="relative w-full overflow-hidden bg-[#0d0c0e]" style={{ aspectRatio: "16 / 9" }}>
      <motion.div
        className="absolute inset-0"
        animate={camera}
        transition={{ type: "spring", stiffness: 120, damping: 24, mass: 0.8 }}
      >
        {/* ── back wall ── */}
        <div
          className="absolute inset-x-0 top-0 h-[54%]"
          style={{
            background:
              "linear-gradient(#191722 0%, #201d29 55%, #2b2531 100%)",
          }}
        >
          {/* tiled wall, receding */}
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #6b6270 1px, transparent 1px), linear-gradient(#6b6270 1px, transparent 1px)",
              backgroundSize: "7% 22%",
            }}
          />
          {/* the one-way mirror */}
          <div
            className="absolute right-[6%] top-[18%] h-[46%] w-[26%] border-2 border-[#2c2731]"
            style={{
              background: "linear-gradient(150deg, #1d222b 0%, #14171d 60%, #10131a 100%)",
              boxShadow: "inset 0 0 40px rgb(0 0 0 / 0.8)",
            }}
          />
        </div>

        {/* ── floor ── */}
        <div
          className="absolute inset-x-0 bottom-0 h-[46%]"
          style={{
            background: "linear-gradient(#2b2531 0%, #1c1822 40%, #121017 100%)",
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
                stroke="#6b6270"
                strokeWidth="1"
              />
            ))}
            {[12, 28, 48, 72].map((y) => (
              <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#6b6270" strokeWidth="1" />
            ))}
          </svg>
        </div>

        {/* ── the practical: one hanging lamp ── */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
          <div className="mx-auto h-[9vh] w-[2px] bg-[#3a343f]" />
          <div
            className="mx-auto h-5 w-16"
            style={{
              background: "linear-gradient(#4a434f, #2b262f)",
              clipPath: "polygon(18% 0, 82% 0, 100% 100%, 0 100%)",
              border: "1px solid #554e5c",
            }}
          />
          <div className="mx-auto -mt-1 h-2.5 w-7 rounded-full bg-[#ffe9b8] blur-[2px]" />
        </div>

        {/* light cone */}
        <div
          className="pointer-events-none absolute left-1/2 top-[11vh] -translate-x-1/2"
          style={{
            width: "68%",
            height: "78%",
            background:
              "linear-gradient(#ffe9b8 0%, rgb(255 233 184 / 0.10) 42%, transparent 78%)",
            clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0 100%)",
            opacity: 0.3,
            filter: "blur(6px)",
          }}
        />

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
                transform: "translateX(-50%)",
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

              <Character
                spec={s.suspect.character}
                expression={s.expression}
                cleared={s.cleared}
                fullBody
                className="h-auto w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
              />

              {/* speech bubble — the line comes out of the person, not just the caption bar */}
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

              {/* nameplate — only for the figure under the light */}
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

        {/* dust in the beam — cheap, and it makes the light feel like it's in the air */}
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
