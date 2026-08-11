"use client";

/**
 * The narrator.
 *
 * Uses the browser's built-in Web Speech API — no API key, no model download, no network
 * call, and it works offline. For a game whose story cards are short noir paragraphs, a
 * voice that is *present* matters more than one that is flawless, and shipping zero bytes
 * to get it is the right trade for a jam build.
 *
 * (The upgrade path, if we ever want it, is a real neural TTS in WASM — Piper or Kokoro via
 * transformers.js. Better voice, but a 20–60MB first load, which would undo the "playable
 * in ninety seconds with no wallet" property the demo is built around.)
 *
 * Two browser facts this has to work around:
 *   1. `getVoices()` is empty until the async `voiceschanged` event fires.
 *   2. Speech will not start without a prior user gesture, so nothing here auto-plays until
 *      the player has clicked something.
 */

export interface NarratorOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
}

/**
 * Voices, best first. These are the deep, unhurried English voices shipped by macOS,
 * Windows and Chrome; the list is a preference order, not a requirement — anything English
 * is acceptable and the platform default is the last resort.
 */
const PREFERRED = [
  "Daniel", // macOS en-GB — the closest thing to a noir narrator built into a laptop
  "Google UK English Male",
  "Microsoft Guy Online (Natural) - English (United States)",
  "Microsoft Ryan Online (Natural) - English (United Kingdom)",
  "Alex", // macOS en-US
  "Google US English",
  "Microsoft David Desktop - English (United States)",
  "Rishi",
  "Arthur",
];

let cached: SpeechSynthesisVoice | null = null;
let muted = false;
let unlocked = false;

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export function narratorAvailable(): boolean {
  return synth() !== null;
}

/** Resolve once the voice list is populated — it is empty on first paint in Chrome. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);

  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);

  return new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    s.addEventListener("voiceschanged", done, { once: true });
    // Safari sometimes never fires the event; don't hang the UI on it.
    setTimeout(done, 1200);
  });
}

export async function pickVoice(): Promise<SpeechSynthesisVoice | null> {
  if (cached) return cached;
  const voices = await loadVoices();
  if (!voices.length) return null;

  for (const name of PREFERRED) {
    const hit = voices.find((v) => v.name === name);
    if (hit) return (cached = hit);
  }
  // Otherwise the first English voice, then whatever exists.
  cached =
    voices.find((v) => v.lang?.startsWith("en-GB")) ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    voices[0];
  return cached;
}

export function setNarratorMuted(value: boolean) {
  muted = value;
  if (value) stopNarration();
}

export function isNarratorMuted() {
  return muted;
}

/**
 * Browsers block speech until the page has seen a real user gesture. Call this from the
 * first click so the opening card can narrate rather than silently failing.
 */
export function unlockNarrator() {
  const s = synth();
  if (!s || unlocked) return;
  unlocked = true;
  const probe = new SpeechSynthesisUtterance("");
  probe.volume = 0;
  s.speak(probe);
}

export function stopNarration() {
  synth()?.cancel();
}

/**
 * Speak a line. Resolves when it finishes (or immediately if narration is off), so callers
 * can sequence beats without guessing at durations.
 */
export function narrate(text: string, opts: NarratorOptions = {}): Promise<void> {
  const s = synth();
  if (!s || muted || !text.trim()) return Promise.resolve();

  s.cancel(); // one narrator at a time

  return new Promise<void>((resolve) => {
    void pickVoice().then((voice) => {
      const u = new SpeechSynthesisUtterance(stripForSpeech(text));
      if (voice) u.voice = voice;
      // Slowed and dropped: the default cadence is a satnav, not a detective.
      u.rate = opts.rate ?? 0.88;
      u.pitch = opts.pitch ?? 0.82;
      u.volume = opts.volume ?? 1;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;

      // Chrome drops long utterances silently; cap the wait so a beat can never wedge.
      setTimeout(finish, Math.min(45000, 900 + text.length * 85));

      s.speak(u);
    });
  });
}

/**
 * Screen text is not speech. Strip the things that read badly aloud: em-dashes become
 * pauses, quotes and ellipses are noise, and a bare number like "9/9" should be spoken.
 */
function stripForSpeech(text: string): string {
  return text
    .replace(/[“”"']/g, "")
    .replace(/—/g, ", ")
    .replace(/\.\.\./g, ",")
    .replace(/(\d+)\/(\d+)/g, "$1 of $2")
    .replace(/\s+/g, " ")
    .trim();
}
