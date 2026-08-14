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
  /** Speak as this seat: its own voice and manner. Omit for the narrator's own voice. */
  seat?: number;
  /** Whether that seat should sound like a woman. Omitted means the mixed pool. */
  feminine?: boolean;
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

/**
 * A different mouth per suspect.
 *
 * One voice reading eight alibis is a man reading a list, and the room stops being people.
 * Every English voice the machine has is put in a stable order and each seat takes one, so
 * the man in seat three sounds like himself every time and never like his neighbour. Pitch
 * and pace are nudged per seat on top, which matters because most machines ship only two or
 * three English voices and the spread has to come from somewhere.
 *
 * Nothing here is guaranteed. A machine with one voice gets one voice, differently pitched.
 */
/**
 * macOS ships a pile of novelty voices, and they are the reason nobody could make out a word.
 *
 * They report `en-US` like any other, and they sort to the very front of an alphabetical list:
 * Albert, Bad News, Bahh, Bells, Boing, Bubbles. Handing each seat the next name off that list
 * gave the first several suspects a voice that sings, whispers, or gargles its lines. Every one
 * of them is unusable for dialogue and none of them can be told apart from a real voice by
 * anything the API exposes, so they have to be named.
 */
const NOVELTY = new Set([
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "deranged",
  "good news", "hysterical", "jester", "organ", "princess", "superstar", "trinoids",
  "whisper", "wobble", "zarvox", "grandma", "grandpa", "rocko", "shelley", "sandy",
  "flo", "eddy", "reed", "junior", "kathy", "bruce", "fred", "ralph", "agnes",
]);

/** Names that mark a voice as one of the good modern ones, whatever the platform calls it. */
const QUALITY = ["premium", "enhanced", "natural", "neural", "siri", "online"];

/**
 * Which voices sound like women, and which sound like men.
 *
 * The API refuses to say. `SpeechSynthesisVoice` exposes a name, a language and a URI, and
 * nothing about who it sounds like, so the only handle available is the given name the
 * platform shipped it under. That is workable, because every platform names them after
 * people: macOS has Samantha and Daniel, Chrome spells it out in the name, Windows has
 * Zira and David.
 *
 * A voice missing from both lists stays unclassified and is usable by anybody, which is the
 * right default: an unknown voice is a worse outcome than a wrong-sounding one only if we
 * refuse to use it at all.
 */
const FEMININE = new Set([
  // macOS / iOS
  "samantha", "allison", "ava", "susan", "victoria", "karen", "moira", "tessa", "fiona",
  "serena", "kate", "nicky", "zoe", "veena", "martha", "matilda", "isha", "noelle",
  // Chrome
  "female",
  // Windows / Edge
  "zira", "aria", "jenny", "michelle", "ana", "emma", "clara", "natasha", "sonia", "libby",
  "hazel", "susan", "linda", "molly", "neerja", "yan", "amber", "ashley", "cora", "elizabeth",
  "monica", "jane", "nancy", "sara", "denise", "eloise",
]);

const MASCULINE = new Set([
  // macOS / iOS
  "alex", "daniel", "tom", "oliver", "rishi", "aaron", "arthur", "gordon", "jamie", "nathan",
  "lee", "xander", "carlos", "diego", "jorge", "juan", "thomas", "yuri", "felipe", "luca",
  // Chrome
  "male",
  // Windows / Edge
  "david", "mark", "guy", "christopher", "eric", "roger", "steffan", "ryan", "andrew",
  "brian", "liam", "william", "prabhat", "george", "james", "connor", "duncan", "adam",
  "alfie", "oliver", "thomas", "tony", "brandon", "jason", "jacob", "kai",
]);

/** Best guess at who a voice sounds like, from the only clue the platform gives: its name. */
function voiceSounds(v: SpeechSynthesisVoice): "f" | "m" | null {
  // "Microsoft Aria Online (Natural) - English (United States)" → aria, online, natural, …
  const words = v.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    if (FEMININE.has(w)) return "f";
    if (MASCULINE.has(w)) return "m";
  }
  return null;
}

/**
 * A voice per suspect, drawn only from voices that can actually be understood.
 *
 * Prefers the platform's good voices and falls back to plain ones, but never to a novelty.
 * If a machine has only one usable voice, everybody shares it: one voice the player can hear
 * beats eight they cannot.
 */
export async function voiceForSeat(
  seat: number,
  feminine?: boolean,
): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices();
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const usable = (english.length ? english : voices).filter(
    (v) => !NOVELTY.has(v.name.trim().toLowerCase().replace(/\s*\(.*\)$/, "")),
  );
  if (!usable.length) return pickVoice();

  const good = usable.filter((v) => QUALITY.some((q) => v.name.toLowerCase().includes(q)));
  let pool = good.length ? good : usable;

  // The right half of the room, where the platform lets us tell which half that is.
  //
  // Without this a man's account came out in whichever voice the alphabet handed his seat,
  // and on a machine whose good voices are mostly women, most of the lineup answered in a
  // woman's voice. Unclassified voices stay in the pool: they are usually fine, and a seat
  // with no voice at all is worse than a seat with an ambiguous one. If the match empties
  // the pool completely, the mixed pool is used rather than nothing.
  // Undefined means masculine, because the cast marks only the women. Skipping the filter
  // whenever the flag was absent meant it never ran for a man at all, and he answered in
  // whichever voice the alphabet handed his seat, which on a Mac is usually a woman's.
  {
    const want = feminine ? "f" : "m";
    const fitted = pool.filter((v) => {
      const sounds = voiceSounds(v);
      return sounds === null || sounds === want;
    });
    // Prefer voices that positively match before ones that merely fail to contradict.
    const exact = fitted.filter((v) => voiceSounds(v) === want);
    pool = exact.length ? exact : fitted.length ? fitted : pool;
  }

  // Sorted by name so the assignment survives a reload. Left to the browser's own ordering,
  // a suspect can come back sounding like somebody else.
  const ordered = [...pool].sort((a, b) => a.name.localeCompare(b.name));
  return ordered[seat % ordered.length]!;
}

/** How that seat carries the voice it was given. Deterministic, so a man keeps his manner. */
export function toneForSeat(seat: number): { pitch: number; rate: number } {
  // Kept close to natural. This used to bottom out at 0.82, which is the same figure the
  // narration settings below were already corrected away from for exactly this reason:
  // pitch-shifting a synthesised voice that far exposes every artefact in it and the words
  // stop being words. A narrow band is enough to tell two men apart.
  return {
    pitch: 0.94 + ((seat * 7) % 9) * 0.022,
    rate: 0.95 + ((seat * 5) % 7) * 0.017,
  };
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
  generation++; // any loop still queueing sentences gives up
  synth()?.cancel();
}

/**
 * Speak a line. Resolves when it finishes (or immediately if narration is off), so callers
 * can sequence beats without guessing at durations.
 */
/**
 * Which narration is current.
 *
 * `cancel()` stops what the engine is *saying*, but it cannot stop the loop below from
 * queueing the rest of its sentences afterwards. So two overlapping calls used to interleave:
 * the older one kept feeding utterances in behind the newer one, and you heard both at once.
 * Every call claims a generation, and any loop whose generation is stale gives up.
 */
let generation = 0;

export async function narrate(text: string, opts: NarratorOptions = {}): Promise<void> {
  const s = synth();
  if (!s || muted || !text.trim()) return;

  const mine = ++generation;
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
    if (generation !== mine) return; // somebody else started talking
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
    const chooser =
      opts.seat === undefined ? pickVoice() : voiceForSeat(opts.seat, opts.feminine);
    void chooser.then((voice) => {
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
