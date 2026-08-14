/**
 * Post-settlement answer data, loaded from the server-only MENTALIST_ANSWERS environment
 * variable. This module must never be imported by a client component.
 */
export interface Answer {
  /** The server-side answer used only after the contract reports settlement. */
  name: string;
  personId: number;
  tell: string;
}

export const ANSWERS: Answer[] = (() => {
  const raw = process.env.MENTALIST_ANSWERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Answer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A malformed key must not take the site down with it. The reveal simply stays shut,
    // which is the safe direction to fail in.
    return [];
  }
})();
