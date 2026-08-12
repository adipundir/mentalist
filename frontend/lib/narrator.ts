"use client";

/**
 * The narrator.
 *
 * Uses the browser's built-in Web Speech API, no API key, no model download, no network
 * call, and it needs no network round-trip. For a game whose story cards are short noir paragraphs, a
 * voice that is *present* matters more than one that is flawless, and shipping zero bytes
 * to get it is the right trade for a jam build.
 *
 * (The upgrade path, if we ever want it, is a real neural TTS in WASM, Piper or Kokoro via
 * transformers.js. Better voice, but a 20–60MB first load, which would undo the "playable
 * to first case" property the game is built around.)
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
 * Voice preference, best first.
 *
 * The ranking matters more than any parameter tweak: modern platforms ship neural voices
 * ("Premium", "Enhanced", "Natural", "Siri") alongside the old formant synthesisers, and
 * the legacy ones are what people mean when they say text-to-speech sounds robotic. We hunt
 * for a neural voice first and only fall back to the classic ones.
 */
const PREFERRED = [
  // macOS neural, genuinely good, and free on any recent Mac.
  "Daniel (Premium)",
  "Daniel (Enhanced)",
  "Oliver (Premium)",
  "Oliver (Enhanced)",
  "Serena (Premium)",
  "Arthur",       // Siri-family en-GB
  "Jamie (Premium)",
  "Alex (Enhanced)",
  // Windows / Edge neural.
  "Microsoft Ryan Online (Natural) - English (United Kingdom)",
  "Microsoft Guy Online (Natural) - English (United States)",
  "Microsoft Brian Online (Natural) - English (United States)",
  // Chrome's bundled voices.
  "Google UK English Male",
  "Google US English",
  // Legacy fallbacks, serviceable, not great.
  "Daniel",
  "Alex",
];

/** Anything with these in the name is a neural voice and beats a legacy one. */
const NEURAL_HINTS = ["premium", "enhanced", "natural", "neural", "siri"];

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

/** Resolve once the voice list is populated, it is empty on first paint in Chrome. */
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

  // Nothing from the list, take any English neural voice before any English legacy one.
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const neural = english.find((v) =>
    NEURAL_HINTS.some((h) => v.name.toLowerCase().includes(h)),
  );

  cached =
    neural ??
    english.find((v) => v.lang?.startsWith("en-GB")) ??
    english[0] ??
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
export async function narrate(text: string, opts: NarratorOptions = {}): Promise<void> {
  const s = synth();
  if (!s || muted || !text.trim()) return;

  s.cancel(); // one narrator at a time

  // Speak sentence by sentence rather than as one block.
  //
  // A single long utterance comes out metronomic, the engine holds one pitch and pace for
  // the whole paragraph. Chunking lets each sentence start fresh, adds a real breath
  // between them, and lets us vary pitch and rate a hair per sentence, which is most of
  // the difference between "reading" and "reciting".
  const sentences = text
    .split(/(?<=[.!?, ])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (let i = 0; i < sentences.length; i++) {
    if (muted) return;
    // Drift, not randomness: sentences trend slightly down in pitch across a paragraph,
    // the way a person's voice does as they finish a thought.
    const drift = -0.02 * (i / Math.max(1, sentences.length - 1));
    const jitter = (Math.random() - 0.5) * 0.05;
    await speakOne(sentences[i], {
      ...opts,
      pitch: (opts.pitch ?? 0.96) + drift + jitter,
      rate: (opts.rate ?? 0.94) + (Math.random() - 0.5) * 0.05,
    });
    // A beat between sentences. Real speech has them; TTS does not unless you ask.
    if (i < sentences.length - 1) await new Promise((r) => setTimeout(r, 210));
  }
}

function speakOne(text: string, opts: NarratorOptions): Promise<void> {
  const s = synth();
  if (!s) return Promise.resolve();

  return new Promise<void>((resolve) => {
    void pickVoice().then((voice) => {
      const u = new SpeechSynthesisUtterance(stripForSpeech(text));
      if (voice) u.voice = voice;
      // Close to natural, and only *slightly* off it.
      //
      // The previous settings dropped pitch to 0.82, which is what was producing the
      // robot: pitch-shifting a synthesised voice that far exposes every artefact in it.
      // Anything below ~0.9 growls. Speed and a touch of variation do the character work
      // instead.
      u.rate = opts.rate ?? 0.94;
      u.pitch = opts.pitch ?? 0.96;
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
    .replace(/, /g, ", ")
    .replace(/\.\.\./g, ",")
    .replace(/(\d+)\/(\d+)/g, "$1 of $2")
    .replace(/\s+/g, " ")
    .trim();
}
