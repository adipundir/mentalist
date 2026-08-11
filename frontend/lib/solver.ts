/**
 * The Notebook.
 *
 * Enumerates every layout still consistent with the testimony you have heard, and reports
 * what that implies. This is deliberately generous: the player should spend their thinking
 * on *which question to ask next*, never on bookkeeping they could do with a pen. Obra Dinn
 * keeps your book for you and is a better game for it.
 *
 * It is also strictly honest — it derives only from information the player legitimately
 * holds (the case parameters, which are stated up front, and their own answers). It never
 * reads hidden state.
 *
 * Cost: the world space is `killer × liarSet`, which for the standard 9/3 case is 9 × 84 =
 * 756 worlds, and for the largest 12/5 case is 12 × 792 = 9,504. Enumerating exhaustively
 * on every render is far cheaper than being clever.
 */

import { inMask, popcount, type Testimony } from "./case";

export interface World {
  killer: number;
  /** Bitmask of who lies. Always includes `killer`. */
  liarMask: number;
}

export interface Deductions {
  worlds: World[];
  /** Seats that could still be the Tyger. */
  candidates: number[];
  /** seat → fraction of surviving worlds in which that seat is the Tyger. */
  killerOdds: number[];
  /** seat → 'liar' | 'honest' | 'unknown', proven across every surviving world. */
  honesty: ("liar" | "honest" | "unknown")[];
  /** True when the testimony admits no layout at all — only reachable if a witness was turned. */
  contradiction: boolean;
}

/**
 * Every layout the dealer can produce.
 *
 * The contract shuffles a base set `B` of exactly `liars` seats, then welds the Tyger in:
 * `liar = B ∪ {killer}`. So a layout is reachable exactly when the killer lies and the
 * liar population is `liars` (the Tyger was already in `B`) or `liars + 1` (he wasn't).
 */
export function enumerateWorlds(suspects: number, liars: number): World[] {
  const worlds: World[] = [];
  const total = 1 << suspects;

  for (let liarMask = 0; liarMask < total; liarMask++) {
    const count = popcount(liarMask);
    if (count !== liars && count !== liars + 1) continue;

    for (let killer = 0; killer < suspects; killer++) {
      // The Tyger always lies.
      if (((liarMask >> killer) & 1) === 0) continue;
      worlds.push({ killer, liarMask });
    }
  }

  return worlds;
}

/** answer = (killer ∈ mask) XOR liar[witness] — the contract's `e.xor`, in the clear. */
export function predictAnswer(world: World, witness: number, mask: number): boolean {
  const truth = inMask(mask, world.killer);
  const lies = ((world.liarMask >> witness) & 1) === 1;
  return truth !== lies;
}

export function deduce(
  suspects: number,
  liars: number,
  testimony: Testimony[],
  /**
   * Seats whose honesty flipped mid-case. Testimony given *before* a witness was turned
   * still constrains their pre-flip state, so a turned witness's constraints are dropped
   * rather than inverted — we cannot know which side of the flip a given answer sits on
   * without tracking order, so we take the sound-but-weaker route.
   */
  turned: number[] = [],
): Deductions {
  const all = enumerateWorlds(suspects, liars);
  const turnedSet = new Set(turned);

  const worlds = all.filter((w) =>
    testimony.every((t) =>
      turnedSet.has(t.witness) ? true : predictAnswer(w, t.witness, t.mask) === t.answer,
    ),
  );

  const killerCounts = new Array(suspects).fill(0);
  const liarCounts = new Array(suspects).fill(0);

  for (const w of worlds) {
    killerCounts[w.killer]++;
    for (let i = 0; i < suspects; i++) {
      if (((w.liarMask >> i) & 1) === 1) liarCounts[i]++;
    }
  }

  const n = worlds.length;

  return {
    worlds,
    candidates: killerCounts.flatMap((c, i) => (c > 0 ? [i] : [])),
    killerOdds: killerCounts.map((c) => (n === 0 ? 0 : c / n)),
    honesty: liarCounts.map((c) => {
      if (n === 0) return "unknown";
      if (c === n) return "liar";
      if (c === 0) return "honest";
      return "unknown";
    }),
    contradiction: n === 0 && testimony.length > 0,
  };
}

/**
 * How much a question is worth right now, in bits, against the current world set — the
 * expected reduction in entropy over *who the Tyger is*.
 *
 * This is what the hint system spends: it lets the UI show a player why a control question
 * on a fresh witness beats a fourth split from someone they already know.
 */
export function informationValue(
  worlds: World[],
  witness: number,
  mask: number,
): number {
  if (worlds.length === 0) return 0;

  const yes: World[] = [];
  const no: World[] = [];
  for (const w of worlds) {
    (predictAnswer(w, witness, mask) ? yes : no).push(w);
  }

  const entropy = (ws: World[]) => {
    if (ws.length === 0) return 0;
    const counts = new Map<number, number>();
    for (const w of ws) counts.set(w.killer, (counts.get(w.killer) ?? 0) + 1);
    let h = 0;
    for (const c of Array.from(counts.values())) {
      const p = c / ws.length;
      h -= p * Math.log2(p);
    }
    return h;
  };

  const before = entropy(worlds);
  const after =
    (yes.length / worlds.length) * entropy(yes) + (no.length / worlds.length) * entropy(no);

  return Math.max(0, before - after);
}

/** The best question available, by information per unit of Focus. Used by the tutorial hint. */
export function suggestQuestion(
  worlds: World[],
  suspects: number,
  focusLeft: number,
): { witness: number; mask: number; bits: number } | null {
  if (worlds.length <= 1) return null;

  const full = (1 << suspects) - 1;
  let best: { witness: number; mask: number; bits: number } | null = null;

  for (let witness = 0; witness < suspects; witness++) {
    // Control question, plus every contiguous-ish split we can afford to evaluate. The
    // full 2^n mask space is too large to search for 12 suspects, so sample the splits
    // that a human would actually consider: prefixes of the live candidate set.
    const candidates = new Set(worlds.map((w) => w.killer));
    const live = Array.from(candidates).sort((a, b) => a - b);

    const masks: number[] = [full];
    for (let take = 1; take < live.length; take++) {
      masks.push(live.slice(0, take).reduce((m, s) => m | (1 << s), 0));
    }

    for (const mask of masks) {
      const cost = mask === full ? 2 : 1;
      if (cost > focusLeft) continue;
      const bits = informationValue(worlds, witness, mask) / cost;
      if (!best || bits > best.bits) best = { witness, mask, bits };
    }
  }

  return best;
}
