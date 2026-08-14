"use client";

import { isNarratorMuted } from "./narrator";

/**
 * The recorded accounts.
 *
 * Every alibi in the casebook is pre-rendered to a file by `scripts/voices.ts`, so a suspect
 * sounds the same to everybody and sounds like a person rather than like whatever text
 * engine the visitor's operating system shipped. The browser's own voice is still there
 * behind this, for any line that has no recording: see `narrate` in `lib/narrator`.
 *
 * One mouth at a time. Walking up to somebody else stops whoever was talking, the same way
 * the synthesised path cancels its own utterance, or two accounts play over each other and
 * neither is worth listening to.
 */
let current: HTMLAudioElement | null = null;

export function stopVoice() {
  if (!current) return;
  current.pause();
  current.src = "";
  current = null;
}

/**
 * Play a seat's account.
 *
 * Resolves `true` once it has finished playing, `false` the moment it is clear there is
 * nothing to play — no file, a codec the browser will not take, or autoplay refused. The
 * caller uses that answer to fall back, so a missing recording costs a beat rather than an
 * account nobody hears.
 */
export function playLine(caseId: number, seat: number): Promise<boolean> {
  return playCue(`c${caseId}-s${seat}`);
}

/** Play any named recording from /public/vo. Same contract as `playLine`. */
export function playCue(name: string): Promise<boolean> {
  if (typeof window === "undefined" || isNarratorMuted()) return Promise.resolve(false);
  stopVoice();

  return new Promise<boolean>((resolve) => {
    const el = new Audio(`/vo/${name}.m4a`);
    current = el;
    let settled = false;
    const done = (played: boolean) => {
      if (settled) return;
      settled = true;
      if (current === el) current = null;
      resolve(played);
    };

    el.addEventListener("ended", () => done(true), { once: true });
    el.addEventListener("error", () => done(false), { once: true });
    // A file that is missing 404s into `error`, but a file that is present and simply never
    // decodes would otherwise hang the caller forever. Nothing in the casebook runs past a
    // minute, so this can only fire on a stall.
    const guard = setTimeout(() => done(false), 60_000);
    el.addEventListener("ended", () => clearTimeout(guard), { once: true });

    el.play().catch(() => done(false));
  });
}
