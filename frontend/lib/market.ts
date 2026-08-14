/**
 * Money, in the units the market speaks.
 *
 * How long a case stands is not in here: the contract owns its own clock and the frontend
 * reads it, because a window invented on this side would eventually promise a player a
 * minute the contract will not honour.
 */

/** Stake bounds, in USDC's six decimals. Mirrors `Mentalist.minStake` / `maxStake`. */
export const MIN_STAKE = 100_000n;
export const MAX_STAKE = 5_000_000n;

export function usdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}
