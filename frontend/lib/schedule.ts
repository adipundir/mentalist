/**
 * The release schedule.
 *
 * One case a day. The season opens with Cinnabar Sunday and a new file lands every
 * twenty-four hours until all seven are out, which is the order the real arc runs in and
 * also the order they get harder.
 *
 * A case does not disappear when the next one arrives. It stays playable until its round
 * closes on chain, so a player who finds the game on day five can still work the earlier
 * rooms, they just arrive at pots other people have already been feeding.
 *
 * The schedule is derived from a fixed epoch rather than stored anywhere: the contract is
 * the authority on when a round actually closes, and this only decides when a case is
 * allowed to appear. Keeping those separate means the clock in the UI can never claim a
 * case is open when the market would reject the entry.
 */

import { CHAPTERS } from "./story";

/** Season one opened when the market was deployed: 2026-08-12, 00:00 UTC. */
export const SEASON_START = Date.UTC(2026, 7, 12);

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface Release {
  index: number;
  /** Unix ms this case becomes playable. */
  opensAt: number;
  released: boolean;
  /** Ms until it opens, or 0 if it already has. */
  until: number;
}

export function releaseOf(index: number, now: number = Date.now()): Release {
  const opensAt = SEASON_START + index * DAY_MS;
  return {
    index,
    opensAt,
    released: now >= opensAt,
    until: Math.max(0, opensAt - now),
  };
}

export function schedule(now: number = Date.now()): Release[] {
  return CHAPTERS.map((_, i) => releaseOf(i, now));
}

/** The newest case that has actually landed, or null before the season opens. */
export function latestReleased(now: number = Date.now()): number | null {
  const out = schedule(now).filter((r) => r.released);
  return out.length ? out[out.length - 1]!.index : null;
}

/** How long until the next file lands, or null once all seven are out. */
export function nextRelease(now: number = Date.now()): Release | null {
  return schedule(now).find((r) => !r.released) ?? null;
}

export function countdown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
