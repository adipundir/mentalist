/**
 * What the suspects say.
 *
 * Each of them has one statement in them, and it is always about the same people. What the
 * enclave decides is whether that statement comes out as an accusation or a denial, because
 * it passes through the speaker's hidden honesty bit on the way. So the words are theirs and
 * the direction is not.
 *
 * The spoken line is flavour; the badge under it is the actual bit. A player should never
 * have to parse prose to know what they were told, but a bare "NO" from a cartoon face is a
 * spreadsheet, not an interrogation.
 *
 * Lines are picked deterministically from (seat, turn) rather than at random, so a suspect
 * keeps a consistent voice instead of code-switching every time you look at them.
 */

/** Accusations. `{n}` is the name or names the speaker is talking about. */
const ACCUSE_ONE = [
  "It was {n}. I'd stake my badge on it.",
  "{n}. That's your man, and I think you already knew.",
  "It was {n}. I saw enough that night to be certain.",
  "{n} did it. I've been waiting a long time for someone to ask me.",
  "Your man is {n}. I'd swear to that in any room you like.",
  "It was {n}. And I hope it ruins your sleep the way it ruins mine.",
];

const ACCUSE_MANY = [
  "It was one of them. {n}. I'd stake my badge on it.",
  "{n}. Look at those two and tell me you're surprised.",
  "One of them did it. {n}. Ask me again and I'll say it again.",
  "It's {n}. Somewhere in there, that's your man.",
  "{n}. That's where I'd look, if I were the looking kind.",
  "One of them. {n}. You can stop pacing now.",
];

const CLEAR_ONE = [
  "Not {n}. I'd have known.",
  "{n}? No. Clean, whatever that's worth to you.",
  "It wasn't {n}. You're burning daylight.",
  "Not {n}. Wrong pond, wrong fish.",
  "{n} had nothing to do with it. Look somewhere else.",
  "It wasn't {n}, and it's painful watching you try.",
];

const CLEAR_MANY = [
  "Not {n}. Neither of them. Try again.",
  "{n}? No. You're burning daylight on those men.",
  "It wasn't {n}. Clean, all of them, whatever that's worth.",
  "Not {n}. He is not in that little group of yours.",
  "{n}, no. I'd have felt it. I'd have known.",
  "It wasn't {n}. You're circling something else entirely.",
];

const CAUGHT = [
  "His mouth's still going. His hands already confessed.",
  "That answer cost him a swallow. He's lying to you.",
  "Flip everything he's told you. All of it.",
  "There it is, the half-beat before the word. He lies.",
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

/** Deterministic pick, same seat, same turn, same line. */
function pick(bank: string[], seat: number, turn: number): string {
  return bank[(seat * 7 + turn * 3) % bank.length];
}

/** "Wagner", "Wagner or Ardiles", "Wagner, Ardiles or Mashburn". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "nobody";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * One suspect's statement about the people they were always going to talk about.
 *
 * `answer` is the bit that came back from the enclave: true means they are putting the
 * killer inside that group, false means they are clearing it. Whether that is the truth
 * depends entirely on them.
 */
export function statement(answer: boolean, about: string[], seat: number, turn: number): string {
  const many = about.length > 1;
  const bank = answer ? (many ? ACCUSE_MANY : ACCUSE_ONE) : many ? CLEAR_MANY : CLEAR_ONE;
  return pick(bank, seat, turn).replace("{n}", nameList(about));
}

export function caughtLine(seat: number, turn: number): string {
  return pick(CAUGHT, seat, turn);
}

export function janeism(turn: number): string {
  return JANEISMS[turn % JANEISMS.length];
}
