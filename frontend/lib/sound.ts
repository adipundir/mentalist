/**
 * Fifteen lines of Web Audio, no assets.
 *
 * The drone is the cheapest latency tool available: two oscillators a minor second apart
 * beat against each other while the chain is thinking, and *resolve to unison* the instant
 * the verdict lands. A stall becomes suspense. Everything here has a redundant visual, so
 * a judge watching muted loses nothing.
 */

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

/** A short percussive tick — the card thunking onto the board. Fires within 300ms of input. */
export function tick(freq = 220, duration = 0.06, gain = 0.05) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, ac.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export interface Drone {
  resolve(): void;
  stop(): void;
}

/**
 * Start the waiting drone. Call `resolve()` when the answer arrives: the upper voice slides
 * down to meet the lower one and the beating stops, which is what makes the moment land.
 */
export function drone(): Drone {
  const ac = audio();
  if (!ac) return { resolve() {}, stop() {} };

  const low = ac.createOscillator();
  const high = ac.createOscillator();
  const amp = ac.createGain();
  const filter = ac.createBiquadFilter();

  low.type = "sine";
  high.type = "sine";
  low.frequency.value = 55; // A1
  high.frequency.value = 58.27; // A#1 — a minor second, so they beat at ~3.3Hz

  filter.type = "lowpass";
  filter.frequency.value = 400;

  amp.gain.setValueAtTime(0.0001, ac.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.08, ac.currentTime + 0.35);

  low.connect(filter);
  high.connect(filter);
  filter.connect(amp).connect(ac.destination);
  low.start();
  high.start();

  let stopped = false;
  const kill = (after: number) => {
    if (stopped) return;
    stopped = true;
    amp.gain.cancelScheduledValues(ac.currentTime);
    amp.gain.setValueAtTime(amp.gain.value, ac.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + after);
    low.stop(ac.currentTime + after + 0.05);
    high.stop(ac.currentTime + after + 0.05);
  };

  return {
    resolve() {
      if (stopped) return;
      // The dissonance closes: the beating stops and the pair sits on one note.
      high.frequency.exponentialRampToValueAtTime(55, ac.currentTime + 0.28);
      kill(0.7);
    },
    stop() {
      kill(0.12);
    },
  };
}

/** The stamp. A hard, dry thud with a little noise on top. */
export function stamp() {
  const ac = audio();
  if (!ac) return;

  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(45, ac.currentTime + 0.14);
  amp.gain.setValueAtTime(0.22, ac.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.22);
  osc.connect(amp).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.24);

  const noise = ac.createBufferSource();
  const buf = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buf;
  const namp = ac.createGain();
  namp.gain.value = 0.09;
  noise.connect(namp).connect(ac.destination);
  noise.start();
}

/** Pen scratch, for a name being crossed out. */
export function scratch() {
  const ac = audio();
  if (!ac) return;
  const noise = ac.createBufferSource();
  const buf = ac.createBuffer(1, ac.sampleRate * 0.09, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.sin((i / data.length) * Math.PI) * 0.6;
  }
  noise.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  const amp = ac.createGain();
  amp.gain.value = 0.07;
  noise.connect(filter).connect(amp).connect(ac.destination);
  noise.start();
}
