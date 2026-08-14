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
/**
 * Nothing here runs on its own.
 *
 * The room tone went the same way as the two music beds: it was a noise loop held open for
 * the life of a scene, and a loop is exactly what a player means when they say they can
 * still hear something. What is left in this file is entirely one-shot — a knock when you
 * walk up to somebody, a tick, a stamp when money goes down — so between actions the game
 * is silent, with no handle left anywhere that could keep a sound alive.
 */

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
/**
 * Winning, in two flavours, alternating so a player who takes several cases in a row does not
 * hear the same four notes each time.
 *
 * Both are built here out of oscillators. Nothing sampled, nothing borrowed: this ships in a
 * public deployment and everything in it has to be ours to ship.
 */
let winTurn = 0;

export function stingSolved() {
  const ac = audio();
  if (!ac) return;
  if (winTurn++ % 2 === 0) stingSolvedRise();
  else stingSolvedGasp();
}

/** A minor chord that arrives, opens up, and rings out. The straight one. */
function stingSolvedRise() {
  brass([110, 130.8, 164.8], { peak: 0.19, decay: 1.5, sweepFrom: 2800, sweepTo: 320 });
  const ac = audio();
  if (!ac) return;
  // The octave lands a beat late, on top, which is what makes it feel like a result rather
  // than a chord.
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

/**
 * The surprised one: a fast swoop up into a bright held note, the shape of somebody catching
 * their breath. Same job as the meme sounds, done with oscillators.
 */
function stingSolvedGasp() {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;

  // The intake. A quarter second bending up nearly an octave.
  const swoop = ac.createOscillator();
  swoop.type = "triangle";
  swoop.frequency.setValueAtTime(196, t0);
  swoop.frequency.exponentialRampToValueAtTime(392, t0 + 0.26);
  const sg = ac.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(0.13, t0 + 0.12);
  sg.gain.setTargetAtTime(0.0001, t0 + 0.24, 0.1);
  swoop.connect(sg);
  toBus(sg, 0.7);
  swoop.start(t0);
  swoop.stop(t0 + 0.9);

  // Then the held note it lands on, with a slow vibrato so it sounds sung rather than beeped.
  const held = ac.createOscillator();
  held.type = "sine";
  held.frequency.setValueAtTime(392, t0 + 0.22);
  const vib = ac.createOscillator();
  vib.frequency.value = 5.2;
  const vibDepth = ac.createGain();
  vibDepth.gain.value = 4.5;
  vib.connect(vibDepth).connect(held.frequency);

  const hg = ac.createGain();
  hg.gain.setValueAtTime(0.0001, t0 + 0.2);
  hg.gain.exponentialRampToValueAtTime(0.15, t0 + 0.34);
  hg.gain.setTargetAtTime(0.0001, t0 + 0.75, 0.42);
  held.connect(hg);
  toBus(hg, 1);
  vib.start(t0 + 0.2);
  held.start(t0 + 0.2);
  held.stop(t0 + 2.4);
  vib.stop(t0 + 2.4);

  // A fifth underneath so the landing has a floor under it.
  const low = ac.createOscillator();
  low.type = "triangle";
  low.frequency.value = 130.8;
  const lg = ac.createGain();
  lg.gain.setValueAtTime(0.0001, t0 + 0.22);
  lg.gain.exponentialRampToValueAtTime(0.09, t0 + 0.4);
  lg.gain.setTargetAtTime(0.0001, t0 + 0.8, 0.5);
  low.connect(lg);
  toBus(lg, 0.9);
  low.start(t0 + 0.22);
  low.stop(t0 + 2.4);
}

/** Wrong, a falling minor second, the sound of the door closing behind him. */
export function stingMissed() {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;

  // Four notes walking down and giving up, each one flatter and slower than the last. The
  // pitch of every note also sags across its own length, which is what makes it read as
  // deflating rather than merely descending.
  const notes = [
    { hz: 233.1, at: 0.0, len: 0.34 },
    { hz: 207.7, at: 0.3, len: 0.36 },
    { hz: 185.0, at: 0.64, len: 0.42 },
    { hz: 155.6, at: 1.02, len: 1.5 },
  ];

  for (const n of notes) {
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(n.hz, t0 + n.at);
    o.frequency.linearRampToValueAtTime(n.hz * 0.945, t0 + n.at + n.len);

    // Rolled well off, or a sawtooth is a buzzer rather than a horn.
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1500, t0 + n.at);
    lp.frequency.exponentialRampToValueAtTime(420, t0 + n.at + n.len);
    lp.Q.value = 3;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + n.at + 0.05);
    // The last note eases out over a second and a half instead of being cut, so the sound
    // ends by running out rather than by stopping.
    g.gain.setTargetAtTime(0.0001, t0 + n.at + n.len * 0.45, n.len * 0.4);

    o.connect(lp).connect(g);
    toBus(g, 0.55);
    o.start(t0 + n.at);
    o.stop(t0 + n.at + n.len + 1.4);
  }
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
 * No score, by choice.
 *
 * There were two beds here, one under the title and one under the room, and both are gone
 * along with the switch that silenced them. A drone a player cannot get away from is a
 * reason to mute the tab, and muting the tab takes the narration and the room with it. What
 * is left is what a sound in this game is for: the knock when you walk up to somebody, the
 * stamp when money goes down, and the air in the room.
 */
