/**
 * Suspects: who is in the lineup, and what they look like.
 *
 * A case is either **canonical** — the real names from the Red John arc, hand-designed so
 * each is recognisable at a glance — or **generated**, for the practice files, dealt
 * deterministically from a seed so a shared case looks identical to everyone who opens it.
 */

import type {
  Accessory,
  CharacterSpec,
  FaceShape,
  FacialHair,
  HairStyle,
  NoseStyle,
} from "@/components/Character";

export interface Suspect {
  seat: number;
  name: string;
  role: string;
  /** Case-file line — what the dossier says about them. */
  dossier: string;
  /** The physical detail a mentalist would notice. */
  tell: string;
  character: CharacterSpec;
}

// ── retro palette ───────────────────────────────────────────
// Muted, slightly chalky mid-century colours. Nothing fully saturated: a pure red would
// fight the one accent the rest of the UI reserves for meaning.

const SKIN = ["#f6cfa4", "#e8b083", "#cf8f61", "#a86c42", "#7c5033", "#fadfc2", "#dba076"];
const HAIR = ["#241b14", "#5a3c25", "#7d5330", "#a8702f", "#c9a05c", "#e6dcc6", "#a9a29c", "#3f3833", "#8c3f22"];
const SUIT = ["#46586b", "#5a4a63", "#33544a", "#6b5540", "#4a4661", "#63464a", "#3d5b63", "#5c5138", "#7a5233"];
const SHIRT = ["#e8e2d4", "#dfe6ea", "#efe3d0", "#e2e6dd"];
const TIE = ["#a83232", "#31708a", "#8a6a2c", "#47663c", "#6d3d63", "#98552c", "#2f4f7a"];

const FACES: FaceShape[] = ["oval", "square", "round", "long"];
const HAIRS: HairStyle[] = [
  "slick", "side-part", "bald", "combover", "wavy", "crew", "bouffant", "receding", "curly", "long",
];
const NOSES: NoseStyle[] = ["button", "hook", "broad", "pointed", "bulb"];
const BEARDS: FacialHair[] = ["none", "none", "mustache", "mustache", "stubble", "goatee", "fullbeard"];
const EXTRAS: Accessory[] = ["none", "none", "none", "none", "none", "glasses", "bowtie", "pipe", "badge", "hat"];

/** mulberry32 — same seed, same lineup, every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES_FIRST = [
  "Ada", "Bram", "Cora", "Dov", "Elsa", "Finn", "Greta", "Hugo", "Iris", "Jonas",
  "Kit", "Lena", "Miles", "Nora", "Otto", "Perry", "Quinn", "Rosa", "Silas", "Tess",
];
const NAMES_LAST = [
  "Ardiles", "Bunting", "Calloway", "Deveraux", "Ellsworth", "Fenwick", "Grieves",
  "Haibach", "Jerrold", "Kessler", "Lowry", "Molinari", "Nashe", "Orme", "Pryce",
  "Reddick", "Stannard", "Thackeray", "Vance", "Whitlock",
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
  "hums when the room goes quiet",
  "smells faintly of pine and earth",
  "keeps their nails cut to the quick",
  "reads Blake in the waiting room",
  "never sits with their back to a door",
  "wears the same brown shoes daily",
  "flinches at the word symmetry",
  "writes only in block capitals",
  "counts change twice, always",
  "laughs a half-beat too late",
  "folds every receipt into thirds",
  "has a burn scar on one shoulder",
  "answers questions with questions",
];

export function generateSuspects(count: number, seed: number): Suspect[] {
  const rand = rng(seed);
  const take = <T,>(xs: T[], used: Set<T>): T => {
    let x: T;
    let guard = 0;
    do {
      x = xs[Math.floor(rand() * xs.length)];
    } while (used.has(x) && ++guard < 40);
    used.add(x);
    return x;
  };

  const usedFirst = new Set<string>();
  const usedLast = new Set<string>();
  const usedRole = new Set<string>();
  const usedTell = new Set<string>();
  const usedLook = new Set<string>();

  return Array.from({ length: count }, (_, seat) => {
    // Silhouette first: hair + face is what distinguishes a suspect at thumbnail size, so
    // that pair is de-duplicated before anything else.
    let hair: HairStyle;
    let face: FaceShape;
    let guard = 0;
    do {
      hair = HAIRS[Math.floor(rand() * HAIRS.length)];
      face = FACES[Math.floor(rand() * FACES.length)];
    } while (usedLook.has(`${hair}/${face}`) && ++guard < 40);
    usedLook.add(`${hair}/${face}`);

    return {
      seat,
      name: `${take(NAMES_FIRST, usedFirst)} ${take(NAMES_LAST, usedLast)}`,
      role: take(ROLES, usedRole),
      dossier: "",
      tell: take(TELLS, usedTell),
      character: {
        id: `gen-${seed}-${seat}`,
        skin: SKIN[Math.floor(rand() * SKIN.length)],
        hairColor: HAIR[Math.floor(rand() * HAIR.length)],
        hair,
        face,
        nose: NOSES[Math.floor(rand() * NOSES.length)],
        facialHair: BEARDS[Math.floor(rand() * BEARDS.length)],
        accessory: EXTRAS[Math.floor(rand() * EXTRAS.length)],
        suit: SUIT[Math.floor(rand() * SUIT.length)],
        shirt: SHIRT[Math.floor(rand() * SHIRT.length)],
        tie: TIE[Math.floor(rand() * TIE.length)],
        tilt: rand() * 5 - 2.5,
      },
    };
  });
}

export function caseNumber(seed: number): string {
  return `#${((seed % 9000) + 1000).toString().padStart(4, "0")}`;
}

const SHADES = [
  "Crimson", "Scarlet", "Vermilion", "Carmine", "Rust", "Oxblood", "Cinnabar",
  "Madder", "Garnet", "Ember",
];
const NOUNS = ["Ledger", "Tally", "Handshake", "Symmetry", "Testimony", "Room", "Blind", "Mark"];

export function caseTitle(seed: number): string {
  const r = rng(seed ^ 0x5eed);
  return `${SHADES[Math.floor(r() * SHADES.length)]} ${NOUNS[Math.floor(r() * NOUNS.length)]}`;
}
