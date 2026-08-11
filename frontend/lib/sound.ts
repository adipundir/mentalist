"use client";

/**
 * Sound design.
 *
 * Every sound here is synthesised at runtime with the Web Audio API. No files, no asset
 * pipeline, no licensing — which matters for a game that has to open instantly on a cold
 * browser, and matters more for one that ships its own source.
 *
 * Three rules the whole palette follows:
 *
 *   1. **No music.** A room tone, not a soundtrack — a barely-audible filtered noise bed
 *      that you notice only when it stops. Constant melody would fight the narrator and
 *      wear out in ninety seconds.
 *   2. **Quiet by default, loud on purpose.** Interaction sounds sit around -30dB. The
 *      stabs are the only genuinely loud events, and they are reserved for the four or five
 *      moments in a case that actually deserve one.
 *   3. **Period-correct.** The punchy moments are brass and strings, because the game is a
 *      1960s interrogation. A meme sting would land once and break the world permanently.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let tone: { stop: () => void } | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || muted) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const bus = () => master ?? undefined;

export function setMuted(value: boolean) {
  muted = value;
  if (value) {
    stopRoomTone();
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  } else if (master && ctx) {
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.05);
  }
}

export function isMuted() {
  return muted;
}

// ── building blocks ─────────────────────────────────────────

/** Noise buffer, cached — regenerating it per hit is wasteful and audibly identical. */
let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // Brown-ish noise: softer and more "room" than white.
      last = (last + Math.random() * 2 - 1) * 0.5;
      d[i] = last;
    }
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function env(ac: AudioContext, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

// ── the room ────────────────────────────────────────────────

/**
 * A barely-there bed of air. Starts on the first interaction and runs until the scene
 * unmounts. You should not be able to name it while it's playing.
 */
export function startRoomTone() {
  const ac = audio();
  if (!ac || tone) return;

  const src = noise(ac);
  src.loop = true;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;

  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 40;

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 2.5);

  src.connect(hp).connect(lp).connect(g).connect(bus()!);
  src.start();

  tone = {
    stop: () => {
      if (!ctx) return;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      setTimeout(() => src.stop(), 1200);
    },
  };
}

export function stopRoomTone() {
  tone?.stop();
  tone = null;
}

// ── interaction ─────────────────────────────────────────────

/** Selecting a suspect: a chair shifting on a hard floor. */
export function knock(pitch = 1) {
  const ac = audio();
  if (!ac) return;

  const thump = ac.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(150 * pitch, ac.currentTime);
  thump.frequency.exponentialRampToValueAtTime(58 * pitch, ac.currentTime + 0.09);
  const tg = env(ac, 0.16, 0.004, 0.1);
  thump.connect(tg).connect(bus()!);
  thump.start();
  thump.stop(ac.currentTime + 0.16);

  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700 * pitch;
  bp.Q.value = 1.2;
  const ng = env(ac, 0.05, 0.002, 0.05);
  n.connect(bp).connect(ng).connect(bus()!);
  n.start();
  n.stop(ac.currentTime + 0.08);
}

/** Marking a name: pen on paper. */
export function tick(freq = 220, duration = 0.05, gain = 0.05) {
  const ac = audio();
  if (!ac) return;
  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 9;
  bp.Q.value = 3;
  const g = env(ac, gain, 0.002, duration);
  n.connect(bp).connect(g).connect(bus()!);
  n.start();
  n.stop(ac.currentTime + duration + 0.05);
}

/** Notebook opening or closing. */
export function paper() {
  const ac = audio();
  if (!ac) return;
  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2400, ac.currentTime);
  bp.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.24);
  bp.Q.value = 0.8;
  const g = env(ac, 0.07, 0.01, 0.24);
  n.connect(bp).connect(g).connect(bus()!);
  n.start();
  n.stop(ac.currentTime + 0.32);
}

/** Committing a question: a hard mechanical switch. */
export function switchClick() {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(900, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.04);
  const g = env(ac, 0.07, 0.001, 0.05);
  o.connect(g).connect(bus()!);
  o.start();
  o.stop(ac.currentTime + 0.09);
}

/** The camera moving — a low air-swell under the push-in. */
export function whoosh() {
  const ac = audio();
  if (!ac) return;
  const n = noise(ac);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(200, ac.currentTime);
  lp.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.22);
  lp.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.55);
  const g = env(ac, 0.075, 0.14, 0.42);
  n.connect(lp).connect(g).connect(bus()!);
  n.start();
  n.stop(ac.currentTime + 0.7);
}

/** A single plucked string — the "tell" when a witness is proven a liar. */
export function pluck(freq = 330) {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3200, ac.currentTime);
  lp.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.4);
  const g = env(ac, 0.1, 0.003, 0.45);
  o.connect(lp).connect(g).connect(bus()!);
  o.start();
  o.stop(ac.currentTime + 0.55);
}

// ── the stabs ───────────────────────────────────────────────

/**
 * A brass stab: detuned saws, a filter slammed shut, a fast envelope.
 *
 * This is the game's exclamation mark. It is genuinely loud, so it fires at exactly four
 * moments — a YES, an accusation, the unmasking, and a miss — and never on navigation.
 * Restraint is what keeps it hitting; a stab on every click is a car alarm.
 */
function brass(
  freqs: number[],
  {
    peak = 0.2,
    decay = 0.5,
    sweepFrom = 2600,
    sweepTo = 260,
    detune = 7,
  }: { peak?: number; decay?: number; sweepFrom?: number; sweepTo?: number; detune?: number } = {},
) {
  const ac = audio();
  if (!ac) return;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 2.5;
  lp.frequency.setValueAtTime(sweepFrom, ac.currentTime);
  lp.frequency.exponentialRampToValueAtTime(sweepTo, ac.currentTime + decay * 0.8);

  const g = env(ac, peak, 0.012, decay);
  lp.connect(g).connect(bus()!);

  for (const f of freqs) {
    for (const d of [-detune, 0, detune]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start();
      o.stop(ac.currentTime + decay + 0.15);
    }
  }
}

/** A YES — the answer that narrows the room. Ominous, not triumphant. */
export function stabYes() {
  brass([110, 165, 220], { peak: 0.17, decay: 0.45 });
}

/** A NO — duller, lower, closes a door. */
export function stabNo() {
  brass([98, 131], { peak: 0.1, decay: 0.32, sweepFrom: 1400, sweepTo: 180 });
}

/** Naming someone. The room holds its breath. */
export function stabAccuse() {
  brass([73.4, 110, 146.8], { peak: 0.22, decay: 0.9, sweepFrom: 3200, sweepTo: 150, detune: 11 });
}

/** Correct — a minor resolution. This is not a happy game. */
export function stingSolved() {
  brass([110, 130.8, 164.8], { peak: 0.19, decay: 1.5, sweepFrom: 2800, sweepTo: 320 });
  const ac = audio();
  if (!ac) return;
  setTimeout(() => {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = 329.6;
    const g = env(ac, 0.07, 0.02, 1.4);
    o.connect(g).connect(bus()!);
    o.start();
    o.stop(ac.currentTime + 1.6);
  }, 240);
}

/** Wrong — a falling minor second, the sound of the door closing behind him. */
export function stingMissed() {
  brass([116.5, 110], { peak: 0.18, decay: 1.2, sweepFrom: 1800, sweepTo: 90, detune: 16 });
}

/** The unmasking. The biggest sound in the game, and it happens once. */
export function stingUnmask() {
  brass([55, 58.3, 82.4, 110], { peak: 0.26, decay: 2.2, sweepFrom: 3600, sweepTo: 70, detune: 18 });
  const ac = audio();
  if (!ac) return;
  // A reversed swell under it, for the drop.
  const n = noise(ac);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(300, ac.currentTime);
  lp.frequency.exponentialRampToValueAtTime(5000, ac.currentTime + 1.1);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.1, ac.currentTime + 1.1);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1.5);
  n.connect(lp).connect(g).connect(bus()!);
  n.start();
  n.stop(ac.currentTime + 1.7);
}

/** The stamp on the verdict card. */
export function stamp() {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(180, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(42, ac.currentTime + 0.13);
  const g = env(ac, 0.24, 0.003, 0.2);
  o.connect(g).connect(bus()!);
  o.start();
  o.stop(ac.currentTime + 0.26);

  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2200;
  const ng = env(ac, 0.09, 0.002, 0.06);
  n.connect(bp).connect(ng).connect(bus()!);
  n.start();
  n.stop(ac.currentTime + 0.1);
}

/** Pen scratch, for a name being crossed out. */
export function scratch() {
  tick(260, 0.09, 0.06);
}

// ── the waiting drone ───────────────────────────────────────

export interface Drone {
  resolve(): void;
  stop(): void;
}

/**
 * Two voices a minor second apart, beating against each other while the answer is computed,
 * resolving to unison the instant it lands. A stall becomes suspense for about twenty lines
 * of code, and it is the highest emotional return in the whole file.
 */
export function drone(): Drone {
  const ac = audio();
  if (!ac) return { resolve() {}, stop() {} };

  const low = ac.createOscillator();
  const high = ac.createOscillator();
  const amp = ac.createGain();
  const lp = ac.createBiquadFilter();

  low.type = "sine";
  high.type = "sine";
  low.frequency.value = 55;
  high.frequency.value = 58.27; // ~3.3Hz beating

  lp.type = "lowpass";
  lp.frequency.value = 420;

  amp.gain.setValueAtTime(0.0001, ac.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.075, ac.currentTime + 0.4);

  low.connect(lp);
  high.connect(lp);
  lp.connect(amp).connect(bus()!);
  low.start();
  high.start();

  let stopped = false;
  const kill = (after: number) => {
    if (stopped || !ctx) return;
    stopped = true;
    amp.gain.cancelScheduledValues(ctx.currentTime);
    amp.gain.setValueAtTime(amp.gain.value, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + after);
    low.stop(ctx.currentTime + after + 0.06);
    high.stop(ctx.currentTime + after + 0.06);
  };

  return {
    resolve() {
      if (stopped || !ctx) return;
      high.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.3);
      kill(0.75);
    },
    stop() {
      kill(0.12);
    },
  };
}
