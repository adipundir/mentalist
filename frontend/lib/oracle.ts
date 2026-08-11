/**
 * The oracle: the thing that answers a question.
 *
 * There are two implementations and the UI cannot tell them apart.
 *
 *   - `localOracle`   deals in the browser and answers instantly. Powers the no-wallet
 *                     demo, so a judge plays a complete case in ninety seconds with no
 *                     wallet, no faucet and no testnet ETH.
 *   - `chainOracle`   sends the move to `Mentalist.sol` on Base and reads the answer back
 *                     through Inco's attested decryption (Loop B — the answer is granted
 *                     to the detective, never publicly revealed).
 *
 * Keeping them behind one interface is what makes the demo *faithful* rather than a
 * mock-up: both deal the same distribution, both compute
 * `answer = truth XOR liar[witness]`, and both enforce the same Focus economy. The demo is
 * deliberately faster than the chain (see the latency note below) — what carries over is
 * the deduction and the choreography, not the wall clock.
 */

import { fullMask, questionCost, type CaseConfig, type Phase } from "./case";

export interface DealtCase {
  caseId: number;
  killer: number;
  liars: boolean[];
}

export interface AskResult {
  answer: boolean;
  cost: number;
  /** Set when the Tyger flipped a witness's honesty as a consequence of this question. */
  turnedWitness: number | null;
}

export interface Oracle {
  readonly kind: "local" | "chain";
  open(config: CaseConfig, seed: number): Promise<DealtCase>;
  ask(witness: number, mask: number, onPhase?: (p: Phase) => void): Promise<AskResult>;
  /** Ends the case and returns the full layout for the post-mortem. */
  accuse(seat: number, onPhase?: (p: Phase) => void): Promise<{ correct: boolean; truth: DealtCase }>;
}

// ── latency ─────────────────────────────────────────────────
//
// MEASURED, on Base Sepolia against the live covalidator, by playing a full case with
// contracts/scripts/play-onchain.ts:
//
//   openCase          ~2.6 s
//   interrogate mine   1.6 – 2.4 s
//   attestedDecrypt    5.5 – 11.3 s   ← the dominant cost, by a wide margin
//   full 6-move case   ~103 s
//
// An earlier draft of this file guessed the decrypt at 420 ms p50 / 1.6 s p95. That was
// wrong by roughly 5×, and the animation budget was built on it.
//
// The demo deliberately does NOT reproduce those numbers. Making a practice file take
// eleven seconds per question would lose a judge before the mechanic ever lands, and the
// demo is honestly labelled as a browser-dealt practice file rather than a simulation of
// chain timing. What the two modes *do* share is the choreography: named phases, a floored
// beat, and a drone that resolves on the answer — so the on-chain wait reads as
// deliberation at 11 s exactly as it does at 1 s.

export const LATENCY = {
  /** Demo-mode pacing: brisk enough to stay playable, slow enough to feel adjudicated. */
  mine: { p50: 260, p95: 900 },
  read: { p50: 420, p95: 1600 },
} as const;

/** What the same steps actually cost on-chain. Kept here so the numbers are not folklore. */
export const MEASURED_CHAIN_LATENCY = {
  open: { p50: 2600, p95: 3200 },
  mine: { p50: 1900, p95: 2400 },
  read: { p50: 6000, p95: 11300 },
} as const;

const sample = (band: { p50: number; p95: number }) =>
  band.p50 + Math.random() * Math.random() * (band.p95 - band.p50);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Floor a beat so it never flashes. Sub-150ms state changes read as a bug; the same
 * verdict staged over a beat reads as adjudicated. Sometimes the fast path should be
 * slower — rhythm beats raw speed for perceived quality.
 */
export async function atLeast<T>(p: Promise<T>, ms: number): Promise<T> {
  const [value] = await Promise.all([p, wait(ms)]);
  return value;
}

// ── local ───────────────────────────────────────────────────

/**
 * Deals the same distribution the contract does: a base liar set of exactly `liars` seats,
 * then the Tyger welded in with an OR. Mirrors `Mentalist._deal` so the demo is a faithful
 * model of the game and not merely a lookalike.
 */
export function dealLocally(config: CaseConfig, seed: number): DealtCase {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const shuffle = <T,>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const n = config.suspects;
  const guilt = shuffle([true, ...Array(n - 1).fill(false)]);
  const base = shuffle([...Array(config.liars).fill(true), ...Array(n - config.liars).fill(false)]);

  const killer = guilt.findIndex(Boolean);
  // liar[i] = base[i] OR guilt[i] — the contract's one-line weld.
  const liars = base.map((b, i) => b || guilt[i]);

  return { caseId: seed, killer, liars };
}

export function localOracle(): Oracle {
  let dealt: DealtCase | null = null;
  let config: CaseConfig | null = null;
  let asked = 0;
  let turnedAlready = false;

  return {
    kind: "local",

    async open(cfg, seed) {
      config = cfg;
      dealt = dealLocally(cfg, seed);
      asked = 0;
      turnedAlready = false;
      await wait(sample(LATENCY.mine));
      return dealt;
    },

    async ask(witness, mask, onPhase) {
      if (!dealt || !config) throw new Error("no case open");

      onPhase?.("mining");
      await wait(sample(LATENCY.mine));
      onPhase?.("reading");
      await wait(sample(LATENCY.read));

      const truth = ((mask >> dealt.killer) & 1) === 1;
      const answer = truth !== dealt.liars[witness];
      asked++;

      let turnedWitness: number | null = null;
      if (config.turnAt !== 0 && !turnedAlready && asked >= config.turnAt) {
        dealt.liars[witness] = !dealt.liars[witness];
        turnedAlready = true;
        turnedWitness = witness;
      }

      onPhase?.("idle");
      return { answer, cost: questionCost(mask, config.suspects), turnedWitness };
    },

    async accuse(seat, onPhase) {
      if (!dealt) throw new Error("no case open");
      onPhase?.("mining");
      await wait(sample(LATENCY.mine));
      onPhase?.("revealing");
      await wait(sample(LATENCY.read));
      onPhase?.("idle");
      return { correct: seat === dealt.killer, truth: dealt };
    },
  };
}

export { fullMask };
