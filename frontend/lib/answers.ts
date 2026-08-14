/**
 * The reasoning behind each case. Prose only.
 *
 * The killer's id is deliberately not in here. Storing it would be storing the answer twice,
 * once encrypted on chain and once in plaintext beside it, and the plaintext copy is the one
 * that gets leaked. `revealAnswer` opens the ciphertext after a case settles and `/api/tell`
 * decrypts it from the chain, so this file cannot give a case away even if it escapes.
 *
 * Server side only, and not in the client bundle.
 */
export interface Answer {
  /** The explanation shown after a case settles. The killer's id is NOT here: it lives only
   *  as ciphertext on chain and `/api/tell` decrypts it from there. */
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
