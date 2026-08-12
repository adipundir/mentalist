/**
 * The game's domain model.
 *
 * Deliberately pure and backend-agnostic: the same types drive every surface (which
 * deals locally) and on-chain play (where the deal happens inside Inco's TEE and answers
 * arrive as attested decryptions). Only the *oracle* differs, see `lib/oracle.ts`.
 */

export type Seat = number;

/** A question: "witness, is Red John one of these people?" */
export interface Question {
  id: number;
  witness: Seat;
  /** Bitmask over seats. Public by design, an opponent sees what you asked. */
  mask: number;
  cost: number;
}

/** A question plus the answer only the detective can read. */
export interface Testimony extends Question {
  answer: boolean;
}

export const CONTROL_COST = 2;
export const QUESTION_COST = 1;

export interface CaseConfig {
  /** Seat bitmask each suspect speaks about, one statement each. */
  claims: number[];
  suspects: number;
  /** Question budget the contract opens with: one per suspect. Never shown to the player. */
  focus: number;
  /** Turncoat. Disabled throughout: with one statement each there is nothing to re-ask. */
  turnAt: number;
  /** Base liar count. Red John is welded on top, so the realised count is `liars` or `liars + 1`. */
  liars: number;
  label: string;
  blurb: string;
}

export type Phase =
  | "idle"
  | "encrypting"
  | "confirm-in-wallet"
  | "mining"
  | "reading"
  | "revealing";

export type Outcome = "playing" | "solved" | "missed";

export interface CaseState {
  config: CaseConfig;
  caseId: number | null;
  focusLeft: number;
  testimony: Testimony[];
  outcome: Outcome;
  accused: Seat | null;
  /** Populated only once the case is over, the full post-mortem. */
  truth: { killer: Seat; liars: boolean[] } | null;
  /** Seats whose witness has been turned, in order. */
  turned: Seat[];
}


// ── mask helpers ────────────────────────────────────────────

export const fullMask = (n: number) => (1 << n) - 1;

export const inMask = (mask: number, seat: Seat) => ((mask >> seat) & 1) === 1;

export const maskSeats = (mask: number, n: number): Seat[] =>
  Array.from({ length: n }, (_, i) => i).filter((i) => inMask(mask, i));

export const popcount = (mask: number) => {
  let c = 0;
  while (mask) {
    mask &= mask - 1;
    c++;
  }
  return c;
};

export const toggleSeat = (mask: number, seat: Seat) => mask ^ (1 << seat);

export const questionCost = (mask: number, n: number) =>
  mask === fullMask(n) ? CONTROL_COST : QUESTION_COST;

/**
 * The three archetypal questions, named so the UI can teach them. Discovering that the
 * control question is a perfect honesty test is the game's whole learning curve.
 */
export type QuestionKind = "control" | "self" | "split";

export function classifyQuestion(mask: number, witness: Seat, n: number): QuestionKind {
  if (mask === fullMask(n)) return "control";
  if (mask === 1 << witness) return "self";
  return "split";
}
