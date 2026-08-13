"use client";

/**
 * Sound design.
 *
 * Every sound here is synthesised at runtime with the Web Audio API. No files, no asset
 * pipeline, no licensing, which matters for a game that has to open instantly on a cold
 * browser, and matters more for one that ships its own source.
 *
 * Three rules the whole palette follows:
 *
 *   1. **No music.** A room tone, not a soundtrack, a barely-audible filtered noise bed
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
let reverb: ConvolverNode | null = null;
let reverbSend: GainNode | null = null;
let muted = false;
let tone: { stop: () => void } | null = null;

/**
 * A concrete room, as an impulse response.
 *
 * This is the single biggest thing separating "synthesised beeps" from "sounds recorded
 * somewhere". Dry oscillators always read as fake because nothing in the physical world is
 * dry; give every hit a tail that decays the way a hard-walled room does and the same
 * synthesis suddenly sounds like it happened in front of a microphone.
 *
 * Built from exponentially-decaying noise with a slight stereo offset. Two seconds, mostly
 * low-mid, which is what a small tiled interrogation room actually sounds like.
 */
function buildRoomImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 1.9);
  const buf = ac.createBuffer(2, len, ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Early reflections, then a smooth exponential tail.
      const decay = Math.pow(1 - t, 2.6);
      const slap = i < ac.sampleRate * 0.02 ? 0 : 1;
      const white = Math.random() * 2 - 1;
      // A gentle lowpass on the tail, high frequencies die first in a real room.
      lp += (white - lp) * 0.22;
      d[i] = lp * decay * slap * (ch === 0 ? 1 : 0.92);
    }
  }
  return buf;
}

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

    // Everything goes through the room, in parallel with the dry signal.
    reverb = ctx.createConvolver();
    reverb.buffer = buildRoomImpulse(ctx);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.34;
    reverbSend.connect(reverb).connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Connect a source to both the dry master and the room. `wet` scales how much of this
 * particular sound goes into the space, a switch click wants a little, a brass stab wants
 * a lot, because a loud sound excites a room more than a quiet one.
 */
function toBus(node: AudioNode, wet = 1) {
  if (master) node.connect(master);
  if (reverbSend && ctx && wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    node.connect(send).connect(reverbSend);
  }
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

/** Noise buffer, cached, regenerating it per hit is wasteful and audibly identical. */
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
  thump.connect(tg);
  toBus(tg, 0.55);
  thump.start();
  thump.stop(ac.currentTime + 0.16);

  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700 * pitch;
  bp.Q.value = 1.2;
  const ng = env(ac, 0.05, 0.002, 0.05);
  n.connect(bp).connect(ng);
  toBus(ng, 0.45);
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
  n.connect(bp).connect(g);
  toBus(g, 0.3);
  n.start();
  n.stop(ac.currentTime + duration + 0.05);
}

/** The camera moving, a low air-swell under the push-in. */
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
  n.connect(lp).connect(g);
  toBus(g, 0.8);
  n.start();
  n.stop(ac.currentTime + 0.7);
}

/** A single plucked string, the "tell" when a witness is proven a liar. */
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
  o.connect(lp).connect(g);
  toBus(g, 0.9);
  o.start();
  o.stop(ac.currentTime + 0.55);
}

// ── the stabs ───────────────────────────────────────────────

/**
 * A brass stab: detuned saws, a filter slammed shut, a fast envelope.
 *
 * This is the game's exclamation mark. It is genuinely loud, so it fires at exactly four
 * moments, a YES, an accusation, the unmasking, and a miss, and never on navigation.
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
  lp.Q.value = 1.4; // a gentler resonance, 2.5 whistled, and whistle reads as synth
  lp.frequency.setValueAtTime(sweepFrom, ac.currentTime);
  lp.frequency.exponentialRampToValueAtTime(sweepTo, ac.currentTime + decay * 0.8);

  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 55; // keep the reverb tail from turning to mud

  // A slow, shallow vibrato. Real players cannot hold a dead-steady pitch, and the ear
  // hears perfectly static pitch as machinery.
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 4.6 + Math.random() * 1.4;
  lfoGain.gain.value = 3.5;
  lfo.connect(lfoGain);
  lfo.start();
  lfo.stop(ac.currentTime + decay + 0.2);

  const g = env(ac, peak, 0.02, decay); // 12ms attack was a click; 20ms is a note
  lp.connect(hp).connect(g);
  toBus(g, 1);

  for (const f of freqs) {
    for (const d of [-detune, 0, detune]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      // Humanise: every voice is a few cents off and enters a few ms late, the way a
      // section does. Perfectly aligned unisons are the sound of a synthesiser.
      o.detune.value = d + (Math.random() * 6 - 3);
      lfoGain.connect(o.detune);
      o.connect(lp);
      o.start(ac.currentTime + Math.random() * 0.012);
      o.stop(ac.currentTime + decay + 0.15);
    }
  }

  // The breath before the note, a short filtered noise transient. This is most of what
  // makes a brass patch sound blown rather than generated.
  const air = noise(ac);
  const airBp = ac.createBiquadFilter();
  airBp.type = "bandpass";
  airBp.frequency.value = 1100;
  airBp.Q.value = 0.7;
  const airG = env(ac, peak * 0.28, 0.006, 0.09);
  air.connect(airBp).connect(airG);
  toBus(airG, 0.6);
  air.start();
  air.stop(ac.currentTime + 0.16);
}

/** Naming someone. The room holds its breath. */
export function stabAccuse() {
  brass([73.4, 110, 146.8], { peak: 0.22, decay: 0.9, sweepFrom: 3200, sweepTo: 150, detune: 11 });
}

/** Correct, a minor resolution. This is not a happy game. */
export function stingSolved() {
  brass([110, 130.8, 164.8], { peak: 0.19, decay: 1.5, sweepFrom: 2800, sweepTo: 320 });
  const ac = audio();
  if (!ac) return;
  setTimeout(() => {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = 329.6;
    const g = env(ac, 0.07, 0.02, 1.4);
    o.connect(g);
    toBus(g, 1);
    o.start();
    o.stop(ac.currentTime + 1.6);
  }, 240);
}

/** Wrong, a falling minor second, the sound of the door closing behind him. */
export function stingMissed() {
  brass([116.5, 110], { peak: 0.18, decay: 1.2, sweepFrom: 1800, sweepTo: 90, detune: 16 });
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
  o.connect(g);
  toBus(g, 0.8);
  o.start();
  o.stop(ac.currentTime + 0.26);

  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2200;
  const ng = env(ac, 0.09, 0.002, 0.06);
  n.connect(bp).connect(ng);
  toBus(ng, 0.6);
  n.start();
  n.stop(ac.currentTime + 0.1);
}

/**
 * Whether the browser will actually let us make a noise yet.
 *
 * An AudioContext starts suspended and only a real user gesture resumes it, so the title
 * screen is silent on a cold visit no matter what we do. It is *not* silent when the player
 * arrives there from somewhere else in the app, because the context is already running, and
 * that is worth taking.
 */
export function audioReady(): boolean {
  return !muted && ctx !== null && ctx.state === "running";
}

/**
 * A door closing somewhere behind you.
 *
 * Played once when the player commits, under the knock, so pressing BEGIN lands as an event
 * rather than as a click. Low, short, and mostly felt.
 */
export function thud() {
  const ac = audio();
  if (!ac) return;

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.28);

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.5, ac.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);

  osc.connect(g);
  toBus(g, 0.8);
  osc.start();
  osc.stop(ac.currentTime + 0.55);

  // a little air moving with it
  const n = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 220;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.14, ac.currentTime);
  ng.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.22);
  n.connect(bp).connect(ng);
  toBus(ng, 0.6);
  n.start();
  n.stop(ac.currentTime + 0.25);
}

/**
 * The bed under the title screen.
 *
 * Not a track. A held minor chord, very low and very quiet, with the two upper voices
 * detuned by a few cents so they beat slowly against each other and the pad never sits
 * still. There is no melody and no rhythm on purpose: this is a room you are standing in
 * before anything has happened, and anything with a pulse would start telling you how to
 * feel about it.
 *
 * Browsers will not let this start on a cold visit, because an AudioContext is suspended
 * until a real gesture. It comes up on the first click and on any later return to the
 * title, which is the most that can honestly be done.
 */
let bed: { stop: () => void } | null = null;

export function startTitleBed() {
  const ac = audio();
  if (!ac || bed) return;

  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 4);

  // A slow sweep across the top so the chord opens and closes rather than droning flat.
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  lp.Q.value = 0.6;

  const sweep = ac.createOscillator();
  sweep.frequency.value = 0.045; // one breath every twenty two seconds
  const sweepDepth = ac.createGain();
  sweepDepth.gain.value = 190;
  sweep.connect(sweepDepth).connect(lp.frequency);
  sweep.start();

  // D minor, rooted low. The fifth is left out: a bare root, third and octave is emptier,
  // and empty is the point.
  const voices = [
    { hz: 36.7, type: "sine" as const, gain: 0.55 },
    { hz: 73.4, type: "triangle" as const, gain: 0.3, detune: -7 },
    { hz: 87.3, type: "triangle" as const, gain: 0.22, detune: 6 },
    { hz: 146.8, type: "sine" as const, gain: 0.12, detune: -4 },
  ];

  const oscs = voices.map((v) => {
    const o = ac.createOscillator();
    o.type = v.type;
    o.frequency.value = v.hz;
    if (v.detune) o.detune.value = v.detune;
    const g = ac.createGain();
    g.gain.value = v.gain;
    o.connect(g).connect(lp);
    o.start();
    return o;
  });

  lp.connect(out);
  toBus(out, 0.9); // a lot of room on it, so it reads as a space rather than a synth

  bed = {
    stop: () => {
      if (!ctx) return;
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.7);
      setTimeout(() => {
        oscs.forEach((o) => o.stop());
        sweep.stop();
      }, 2600);
    },
  };
}

export function stopTitleBed() {
  bed?.stop();
  bed = null;
}
