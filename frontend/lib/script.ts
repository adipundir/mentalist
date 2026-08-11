/**
 * What the suspects say.
 *
 * The spoken line is flavour; the YES/NO badge under it is the actual bit. That split is
 * deliberate — a player should never have to parse prose to know what they were told, but
 * a bare "NO" from a cartoon face is a spreadsheet, not an interrogation.
 *
 * Lines are picked deterministically from (seat, question index) rather than at random, so
 * a suspect keeps a consistent voice across a case instead of code-switching every turn.
 */

const YES = [
  "He's in that group. I'd stake my badge on it.",
  "Yes. God help us, but yes.",
  "One of them. I've thought so for months.",
  "You're looking right at him.",
  "Yes — and he knows you're asking.",
  "Among those, certainly.",
  "I'd say yes. I'd say it quietly.",
  "That's where you'll find him.",
  "Yes. Don't make me say the name.",
  "He's standing in that lineup.",
  "Yes. I've seen how he watches you.",
  "In that group, without question.",
];

const NO = [
  "Not one of them. Not a chance.",
  "No. You're wasting your reads.",
  "I've known those men for years. No.",
  "No — look somewhere else.",
  "Not there. I'd know.",
  "No. Whoever he is, he isn't standing there.",
  "You're cold. Very cold.",
  "No. I'd tell you if it were.",
  "Not among those, no.",
  "No. And I'd swear to that.",
  "Wrong group entirely.",
  "No. Try the ones you haven't touched.",
];

const CAUGHT = [
  "That was a lie, and you both know it.",
  "You misremembered. Conveniently.",
  "Your story just changed shape.",
  "Careful. That contradicts you.",
  "You've been lying since I sat down.",
  "That one cost you.",
  "I can work with a liar. I just have to invert you.",
  "Thank you. A reliable liar is as good as an honest man.",
];

/** Patrick Jane, to himself, between questions. */
export const JANEISMS = [
  "Everybody lies. The trick is working out which way.",
  "I'm not psychic. I just pay attention.",
  "A man who lies consistently is a man you can use.",
  "The question you already know the answer to is the only honest one.",
  "He's enjoying this. That's the part I can never forgive.",
  "Watch the hands. The face is rehearsed.",
  "Nobody in this room is telling me the whole truth.",
  "If I ask everyone, the answer stops being about him and starts being about you.",
  "He's counting my questions. I'd count his.",
  "Certainty is expensive. Guessing is cheap. Choose.",
];

/** Deterministic pick — same seat, same turn, same line. */
function pick(bank: string[], seat: number, turn: number): string {
  return bank[(seat * 7 + turn * 3) % bank.length];
}

export function replyLine(answer: boolean, seat: number, turn: number): string {
  return pick(answer ? YES : NO, seat, turn);
}

export function caughtLine(seat: number, turn: number): string {
  return pick(CAUGHT, seat, turn);
}

export function janeism(turn: number): string {
  return JANEISMS[turn % JANEISMS.length];
}
