"use client";



/**
 * The recorded accounts.
 *
 * Every alibi in the casebook is pre-rendered to a file by `scripts/voices.ts`, so a suspect
 * sounds the same to everybody and sounds like a person rather than like whatever text
 * engine the visitor's operating system shipped. It is also the only voice in the game:
 * `speechSynthesis` is gone, and a line with no recording is read, not spoken.
 *
 * One mouth at a time. Walking up to somebody else stops whoever was talking, the same way
 * the synthesised path cancels its own utterance, or two accounts play over each other and
 * neither is worth listening to.
 */
let current: { el: HTMLAudioElement; abort: () => void } | null = null;
let muted = false;

export function isVoiceMuted() {
  return muted;
}

/** Silencing the voice also stops whoever is mid-sentence right now. */
export function setVoiceMuted(value: boolean) {
  muted = value;
  if (value) stopVoice();
}

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
 * nothing to play — no file, or a codec the browser will not take. There is no other voice
 * behind this one: a line without a recording is a line the player reads, which is better
 * than a line read to them by whatever text engine their machine ships.
 *
 * Autoplay refusal is not "nothing to play". A card that mounts straight after a navigation
 * has had no gesture yet, so the browser rejects `play()`. Refusal waits for the first
 * gesture and plays the recording then; the worst case is a silent beat before the
 * player's first click.
 */
export function playLine(caseId: number, seat: number): Promise<boolean> {
  return playCue(`c${caseId}-s${seat}`);
}

/** Play any named recording from /public/vo. Same contract as `playLine`. */
export function playCue(name: string): Promise<boolean> {
  if (typeof window === "undefined" || muted) return Promise.resolve(false);
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
