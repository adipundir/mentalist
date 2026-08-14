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
let current: { el: HTMLAudioElement; abort: () => void } | null = null;

export function stopVoice() {
  if (!current) return;
  const c = current;
  current = null;
  c.abort();
}

/**
 * Play a seat's account.
 *
 * Resolves `true` once it has finished playing, `false` the moment it is clear there is
 * nothing to play — no file, a codec the browser will not take. The caller uses that answer
 * to fall back to the synthesised voice, so a missing recording costs a beat rather than an
 * account nobody hears.
 *
 * Autoplay refusal is not "nothing to play". A card that mounts straight after a navigation
 * has had no gesture yet, so the browser rejects `play()` — and `speechSynthesis` is not
 * gated the same way, which meant the fallback spoke where the recording could not, and the
 * one voice that ever played before a click was the browser's. Refusal now waits for the
 * first gesture and plays the recording then: the promise stays open, so the fallback never
 * fires early, and the worst case is a silent beat before the player's first click.
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
    let settled = false;
    let unhook: (() => void) | null = null;
    let stall: ReturnType<typeof setTimeout> | null = null;

    const done = (played: boolean) => {
      if (settled) return;
      settled = true;
      unhook?.();
      if (stall) clearTimeout(stall);
      el.pause();
      el.src = "";
      if (current?.el === el) current = null;
      resolve(played);
    };
    current = { el, abort: () => done(false) };

    el.addEventListener("ended", () => done(true), { once: true });
    el.addEventListener("error", () => done(false), { once: true });
    // Nothing in the casebook runs long: once sound has started, a couple of minutes of
    // not-finishing is a stall, not a monologue.
    el.addEventListener(
      "playing",
      () => {
        stall = setTimeout(() => done(false), 180_000);
      },
      { once: true },
    );

    const tryPlay = () =>
      el.play().catch((e) => {
        if (!settled && (e as DOMException)?.name === "NotAllowedError") {
          const retry = () => {
            unhook?.();
            unhook = null;
            tryPlay();
          };
          unhook = () => {
            window.removeEventListener("pointerdown", retry, true);
            window.removeEventListener("keydown", retry, true);
          };
          window.addEventListener("pointerdown", retry, { once: true, capture: true });
          window.addEventListener("keydown", retry, { once: true, capture: true });
        } else {
          done(false);
        }
      });
    tryPlay();
  });
}
