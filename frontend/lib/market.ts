/**
 * The market's timing constants, shared by the clock in the room and by the contract calls.
 *
 * A case stands for a fixed window and then it settles. The window is short on purpose: it
 * is the reason a stake means anything. You are not betting on a puzzle you can grind at
 * forever, you are betting on what you can read out of a room before it closes.
 */

/** How long a single case accepts a verdict once you have opened it. */
export const CASE_WINDOW_MS = 20 * 60 * 1000;

/** Stake bounds, in USDC's six decimals. Mirrors CaseMarket's own limits. */
export const MIN_STAKE = 100_000n;
export const MAX_STAKE = 5_000_000n;

export function usdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}
