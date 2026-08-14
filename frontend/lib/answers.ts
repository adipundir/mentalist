/**
 * The answers, and the reasoning that gives them away.
 *
 * Carried in an environment variable, not in this repository and not in the client bundle.
 * They used to sit in `casebook.ts`, which is tracked and ships to every browser, so the
 * killer of every case was one devtools tab away. The ciphertext on chain was still doing its
 * job, fixing the answer before the first bet so the author cannot move it, but a game that
 * sells confidentiality cannot hand the answer to anyone who opens the sources.
 *
 * Read only on the server: `deploy.ts` encrypts each answer on the authoring machine, and
 * `/api/tell` releases one only once the chain says that case is settled.
 */
export interface Answer {
  id: number;
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
