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
  "Yes. One of them. I'd stake my badge on it.",
  "Yes — and you knew that before you asked me.",
  "Yes. Look at that little group and tell me you're surprised.",
  "Yeah. He's standing right there in your crowd.",
  "Yes. I'd say so. I'd very definitely say so.",
  "Yes. Now ask me something that actually costs you.",
  "Yes, Mr. Jane. Warm. You're getting warm.",
  "Yes. Somewhere in that huddle, that's your man.",
  "Yes. And I hope it ruins your sleep the way it ruins mine.",
  "Yes — that's where I'd look, if I were the looking kind.",
  "Yes. You can stop pacing now.",
  "Yes. Write it down. You'll want it later.",
];

const NO = [
  "No. Not one of them. Try again.",
  "No. You're burning daylight on those men.",
  "No — you're not close, and it's painful to watch.",
  "No. Clean, all of them. Whatever that's worth to you.",
  "No. Wrong pond, wrong fish.",
  "No. And that one's free. The next one isn't.",
  "No. He is not in that little group of yours.",
  "No. I'd have felt it. I'd have known.",
  "No, Mr. Jane. Not there. Keep digging.",
  "No. You're circling something else entirely.",
  "No. Not among that lot, and you know it.",
  "No. Ask better questions.",
];

const CAUGHT = [
  "His mouth's still going. His hands already confessed.",
  "That answer cost him a swallow. He's lying to you.",
  "Flip everything he's told you. All of it.",
  "There it is — the half-beat before the word. He lies.",
  "He blinked on the wrong syllable. Nothing he says is worth its weight.",
  "Caught. Invert his answers and move along.",
  "A liar. Not even a good one. That's almost insulting.",
  "He told the truth about nothing at all. Useful, in its way.",
];

/** Said when the culprit is finally named. */
export const UNMASK = [
  "The face doesn't change. That's how you know it was never a mask.",
  "Ten years, and he was always standing on the right side of the tape.",
  "There you are. You've been in every room I've ever been in.",
  "He smiles. Clockwise, three fingers wide, and finally with his own face.",
  "Tyger, tyger. Say it. Say it and be finished.",
  "He looks almost relieved. Being seen was always the point.",
];

/** Patrick Jane, to himself, between questions. */
export const JANEISMS = [
  "There's no such thing as psychics. There is such a thing as paying attention.",
  "People tell you everything. They simply prefer not to use words.",
  "He isn't hiding. He's standing very still. That's a different thing.",
  "A liar has already told you what he's frightened of.",
  "Nobody looks at the body first. They look at the face on the wall.",
  "Grief is a locked room. I've been living in the hallway.",
  "Trust the man with nothing to gain. There usually isn't one.",
  "Everyone here has a story ready. The readiness is the tell.",
  "I don't need him to confess. I need him to be consistent.",
  "Tea first. Then the terrible part.",
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
