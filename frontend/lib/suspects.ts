/**
 * Suspect generation.
 *
 * Names and dossier flavour are generated rather than borrowed: the game's inspiration is
 * CBS-owned, so the antagonist is Blake's Tyger (public domain, 1794) and every suspect
 * here is ours. Deterministic from a seed so a case can be shared and replayed exactly.
 */

const SURNAMES = [
  "Ardiles", "Bunting", "Calloway", "Deveraux", "Ellsworth", "Fenwick", "Grieves",
  "Haibach", "Ivorson", "Jerrold", "Kessler", "Lowry", "Molinari", "Nashe", "Orme",
  "Pryce", "Quillon", "Reddick", "Stannard", "Thackeray", "Ulster", "Vance", "Whitlock",
  "Yarrow", "Ziegler", "Marchetti", "Cutler", "Renfrew", "Halloran", "Sable",
];

const FORENAMES = [
  "Ada", "Bram", "Cora", "Dov", "Elsa", "Finn", "Greta", "Hugo", "Iris", "Jonas",
  "Kit", "Lena", "Miles", "Nora", "Otto", "Perry", "Quinn", "Rosa", "Silas", "Tess",
  "Ute", "Viktor", "Wren", "Xenia", "Yves", "Zora", "Cass", "Dane", "Edie", "Fabian",
];

const ROLES = [
  "county sheriff", "forensic lead", "bureau director", "private investigator",
  "church elder", "homeland liaison", "coroner", "beat reporter", "defence attorney",
  "records clerk", "night porter", "arson inspector", "pathologist", "bail bondsman",
  "customs officer", "stenographer", "harbour master", "prison chaplain",
];

const TELLS = [
  "drinks tea, never coffee",
  "will not shake with the left hand",
  "hums Bach when nervous",
  "smells faintly of pine and earth",
  "keeps their nails cut to the quick",
  "reads Blake in the waiting room",
  "never sits with their back to a door",
  "wears the same brown shoes daily",
  "flinches at the word 'symmetry'",
  "carries a linoleum knife for 'work'",
  "writes only in block capitals",
  "counts change twice, always",
  "cannot abide an unclosed door",
  "laughs a half-beat too late",
  "folds every receipt into thirds",
  "quotes scripture but not correctly",
  "has a burn scar on one shoulder",
  "answers questions with questions",
];

/** Deterministic 32-bit PRNG (mulberry32) — same seed, same lineup, every time. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Suspect {
  seat: number;
  name: string;
  role: string;
  tell: string;
  /** Deterministic portrait parameters — drawn, not loaded, so there are no image assets. */
  portrait: { hue: number; jaw: number; brow: number; tilt: number };
}

export function generateSuspects(count: number, seed: number): Suspect[] {
  const rand = rng(seed);
  const pick = <T,>(xs: T[], used: Set<T>): T => {
    let x: T;
    do {
      x = xs[Math.floor(rand() * xs.length)];
    } while (used.has(x) && used.size < xs.length);
    used.add(x);
    return x;
  };

  const usedSur = new Set<string>();
  const usedFore = new Set<string>();
  const usedRole = new Set<string>();
  const usedTell = new Set<string>();

  return Array.from({ length: count }, (_, seat) => ({
    seat,
    name: `${pick(FORENAMES, usedFore)} ${pick(SURNAMES, usedSur)}`,
    role: pick(ROLES, usedRole),
    tell: pick(TELLS, usedTell),
    portrait: {
      hue: Math.floor(rand() * 40) - 20,
      jaw: 0.75 + rand() * 0.5,
      brow: 0.6 + rand() * 0.8,
      tilt: rand() * 6 - 3,
    },
  }));
}

/** A case number that looks like it came out of a filing cabinet. */
export function caseNumber(seed: number): string {
  return `#${(seed % 9000 + 1000).toString().padStart(4, "0")}`;
}

/** Episode-style case titles: red while open, blue once closed. */
const SHADES = [
  "Crimson", "Scarlet", "Vermilion", "Carmine", "Rust", "Oxblood", "Cinnabar",
  "Madder", "Garnet", "Ember",
];
const NOUNS = ["Ledger", "Tally", "Handshake", "Symmetry", "Testimony", "Room", "Blind", "Mark"];

export function caseTitle(seed: number): string {
  const r = rng(seed ^ 0x5eed);
  return `${SHADES[Math.floor(r() * SHADES.length)]} ${NOUNS[Math.floor(r() * NOUNS.length)]}`;
}
