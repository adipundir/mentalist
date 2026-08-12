/**
 * The canonical cast of the Red John arc, drawn to the character system.
 *
 * Each is designed to be unmistakable at 48px, the silhouette (hair shape) and the palette
 * do the work, because in a lineup of seven the player identifies people by colour and
 * outline long before they read a name.
 *
 * Canon notes worth keeping straight: the smiley is drawn *clockwise* with three gloved
 * fingers; the Blake Association's passcode is "Tyger Tyger" and its mark is three
 * horizontal dots on the **left** shoulder; McAllister is Red John.
 */

import type { CharacterSpec } from "@/components/Character";
import type { Suspect } from "./suspects";

export interface CanonPerson {
  id: string;
  name: string;
  role: string;
  dossier: string;
  tell: string;
  character: Omit<CharacterSpec, "id">;
}

const P = (
  id: string,
  name: string,
  role: string,
  dossier: string,
  tell: string,
  character: Omit<CharacterSpec, "id">,
): CanonPerson => ({ id, name, role, dossier, tell, character });

// ── the seven, plus the CBI ─────────────────────────────────

export const CAST: Record<string, CanonPerson> = {
  mcallister: P(
    "mcallister",
    "Thomas McAllister",
    "Sheriff, Napa County",
    "Elected four terms. Vineyard homicides, county fairs, missing hikers. Universally liked. Cooperative on every CBI request.",
    "Takes his hat off indoors and holds it flat to his chest, rocking on his heels. A patient man, letting you finish.",
    { skin: "#e8b083", hairColor: "#a9a29c", hair: "combover", face: "square", nose: "broad",
      facialHair: "none", accessory: "hat", suit: "#a8925e", shirt: "#e8e2d4", tie: "#5c5138", tilt: -1 },
  ),
  bertram: P(
    "bertram",
    "Gale Bertram",
    "Director, CBI",
    "Career administrator. Signs everything, remembers everything. Quotes poetry at press conferences. Protects the Bureau's image before its people.",
    "His smile arrives a half-beat after his eyes do, and he thumbs the knot of his maroon tie before every answer.",
    { skin: "#f6cfa4", hairColor: "#d9d3c8", hair: "receding", face: "round", nose: "bulb",
      facialHair: "none", accessory: "glasses", suit: "#3b3f47", shirt: "#e8e2d4", tie: "#7d2b2b", tilt: 1 },
  ),
  smith: P(
    "smith",
    "Reede Smith",
    "Special Agent, FBI",
    "Decorated twice. One shooting review sealed by request. Works organized crime. Drinks alone. Answers questions with shorter questions.",
    "Will not stand within a yard of a railing or an open stairwell; the muscle in his jaw ticks when he has to.",
    { skin: "#cf8f61", hairColor: "#241b14", hair: "crew", face: "square", nose: "pointed",
      facialHair: "stubble", accessory: "badge", suit: "#2f3a52", shirt: "#c9ccd1", tie: "#8a6a2c", tilt: 0 },
  ),
  stiles: P(
    "stiles",
    "Bret Stiles",
    "Founder, Visualize",
    "A church of seventy thousand. Never charged. Knows facts about Red John that no innocent man could possibly know.",
    "Delighted, barely-blinking eyes, and a fine tremor in the left hand he makes no effort to hide.",
    { skin: "#fadfc2", hairColor: "#f0ece2", hair: "slick", face: "long", nose: "hook",
      facialHair: "none", accessory: "none", suit: "#ddd3bd", shirt: "#3f7a63", tie: "#c2b79c", tilt: 2 },
  ),
  haffner: P(
    "haffner",
    "Raymond Haffner",
    "Private investigator",
    "Visualize member since adolescence. Ran Jane's unit for six weeks. Competent, humourless, resents being outthought publicly.",
    "Squares his shoulders in every doorway and clocks the exits, then flinches from a cobweb like a much smaller man.",
    { skin: "#e8b083", hairColor: "#c9a05c", hair: "crew", face: "square", nose: "broad",
      facialHair: "none", accessory: "none", suit: "#5c6b3f", shirt: "#2b2b2b", tie: "#3f4a2c", tilt: -2 },
  ),
  kirkland: P(
    "kirkland",
    "Robert Kirkland",
    "Special Agent, Homeland Security",
    "Federal, unattached, unaccountable. Reads your file before he meets you. Twin brother missing since 2004.",
    "The same pillar-box red tie every day. Stands a half-step too close, and blinks far too little.",
    { skin: "#dba076", hairColor: "#1a1410", hair: "side-part", face: "long", nose: "pointed",
      facialHair: "none", accessory: "none", suit: "#23252b", shirt: "#f2f0ea", tie: "#c62828", tilt: 0 },
  ),
  partridge: P(
    "partridge",
    "Brett Partridge",
    "Lead forensic investigator, CBI",
    "Fourteen Red John scenes attended. Photographs them well beyond requirement. Calls the victims 'the work'. Colleagues avoid him.",
    "Gloves on before he's out of the car; leans in close over the blood and wets his lips without noticing.",
    { skin: "#f6cfa4", hairColor: "#7d5330", hair: "combover", face: "long", nose: "pointed",
      facialHair: "none", accessory: "glasses", suit: "#8a6a44", shirt: "#c9a83f", tie: "#6b5327", tilt: 3 },
  ),

  // Chapter 1–3 outsiders, from Jane's original notebook page.
  mashburn: P("mashburn", "Walter Mashburn", "Industrialist",
    "Self-made, bored, and rich enough to be interesting. Collects cars, art and risk.",
    "Enjoys being suspected. Answers the question you didn't ask.",
    { skin: "#e8b083", hairColor: "#3f3833", hair: "wavy", face: "oval", nose: "button",
      facialHair: "stubble", accessory: "none", suit: "#5a4a63", shirt: "#e8e2d4", tie: "#6d3d63", tilt: -1 }),
  mars: P("mars", "Ellis Mars", "Defence attorney",
    "Represents the people nobody else will. Has never lost on a technicality he didn't manufacture.",
    "Smiles with the lower half of his face only.",
    { skin: "#a86c42", hairColor: "#241b14", hair: "bald", face: "round", nose: "broad",
      facialHair: "goatee", accessory: "bowtie", suit: "#3d5b63", shirt: "#efe3d0", tie: "#31708a", tilt: 1 }),
  harken: P("harken", "Dean Harken", "Retired police captain",
    "Ran the first Red John taskforce. Took early retirement two weeks after it was disbanded.",
    "Refers to the victims by case number, never by name.",
    { skin: "#f6cfa4", hairColor: "#a9a29c", hair: "receding", face: "square", nose: "bulb",
      facialHair: "mustache", accessory: "none", suit: "#46586b", shirt: "#dfe6ea", tie: "#2f4f7a", tilt: 0 }),
  cooper: P("cooper", "Jason Cooper", "Visualize senior member",
    "Twenty years inside the church. Handles what Stiles prefers not to know about.",
    "Repeats your last three words back to you before answering.",
    { skin: "#cf8f61", hairColor: "#5a3c25", hair: "side-part", face: "oval", nose: "hook",
      facialHair: "none", accessory: "none", suit: "#33544a", shirt: "#e2e6dd", tie: "#47663c", tilt: -2 }),
  molinari: P("molinari", "Vint Molinari", "Bail bondsman",
    "Knows every fugitive in three counties and where their mothers live. Cash business.",
    "Counts something in his pocket while he talks.",
    { skin: "#7c5033", hairColor: "#241b14", hair: "curly", face: "round", nose: "broad",
      facialHair: "fullbeard", accessory: "pipe", suit: "#63464a", shirt: "#efe3d0", tie: "#98552c", tilt: 2 }),
  wagner: P("wagner", "Dr. Linus Wagner", "Psychiatrist",
    "Treats the worst of them and sleeps soundly. Published on the aesthetics of violence.",
    "Answers a question with a longer, kinder question.",
    { skin: "#fadfc2", hairColor: "#e6dcc6", hair: "wavy", face: "long", nose: "pointed",
      facialHair: "goatee", accessory: "glasses", suit: "#4a4661", shirt: "#e8e2d4", tie: "#6d3d63", tilt: 1 }),
  minelli: P("minelli", "Virgil Minelli", "Former CBI director",
    "Ran the Bureau for eleven years. Retired the day Jane's family were found.",
    "Looks at the floor when he says the name.",
    { skin: "#e8b083", hairColor: "#a9a29c", hair: "bald", face: "square", nose: "bulb",
      facialHair: "mustache", accessory: "none", suit: "#5c5138", shirt: "#e8e2d4", tie: "#8a6a2c", tilt: 0 }),
  morning: P("morning", "Dr. Towlen Morning", "Coroner",
    "Signed nine of the Red John autopsies. Immaculate paperwork, unusual enthusiasm.",
    "Describes wounds with his hands.",
    { skin: "#dba076", hairColor: "#3f3833", hair: "slick", face: "long", nose: "hook",
      facialHair: "none", accessory: "glasses", suit: "#38454a", shirt: "#dfe6ea", tie: "#2f4f7a", tilt: -1 }),
  ardiles: P("ardiles", "Oscar Ardiles", "Professor of criminology",
    "Consults for three agencies. Wrote the profile everyone still uses. Enjoys being right.",
    "Corrects your grammar mid-interrogation.",
    { skin: "#cf8f61", hairColor: "#5a3c25", hair: "bouffant", face: "oval", nose: "button",
      facialHair: "mustache", accessory: "bowtie", suit: "#7a5233", shirt: "#efe3d0", tie: "#a83232", tilt: 2 }),

  // The team.
  jane: P("jane", "Patrick Jane", "Consultant, CBI",
    "Independent consultant. No badge, no gun, no patience. Was a very successful fraud.",
    "Drinks tea. Never coffee.",
    { skin: "#f6cfa4", hairColor: "#d8b25c", hair: "curly", face: "oval", nose: "button",
      facialHair: "none", accessory: "none", suit: "#9a9aa2", shirt: "#8ab4d4", tie: "#8ab4d4", tilt: -2 }),
  lisbon: P("lisbon", "Teresa Lisbon", "Senior Agent, CBI",
    "Runs the unit and the man who ignores it. Twelve years, no reprimands she'll admit to.",
    "Touches the cross at her throat when she's about to overrule you.",
    { skin: "#f6cfa4", hairColor: "#1a1410", hair: "long", face: "oval", nose: "button",
      facialHair: "none", accessory: "badge", suit: "#2f4a3a", shirt: "#f2f0ea", tie: "#2f4a3a", tilt: 1 }),
  cho: P("cho", "Kimball Cho", "Agent, CBI",
    "Says the true thing in the fewest words available. Former gang member, former Army Ranger.",
    "Does not blink during interviews. At all.",
    { skin: "#e8c39a", hairColor: "#171310", hair: "crew", face: "square", nose: "button",
      facialHair: "none", accessory: "badge", suit: "#2b3540", shirt: "#e8e2d4", tie: "#3d4a56", tilt: 0 }),
  rigsby: P("rigsby", "Wayne Rigsby", "Agent, CBI",
    "Arson specialist. Large, decent, and transparently in love with a colleague.",
    "Eats while he thinks.",
    { skin: "#f0c39a", hairColor: "#4a3527", hair: "crew", face: "square", nose: "broad",
      facialHair: "none", accessory: "badge", suit: "#4a4038", shirt: "#dfe6ea", tie: "#6b5327", tilt: -1 }),
  vanpelt: P("vanpelt", "Grace Van Pelt", "Agent, CBI",
    "The unit's researcher. Believes in more things than the rest of them combined.",
    "Writes down everything, including the things Jane says.",
    { skin: "#f6cfa4", hairColor: "#a8702f", hair: "long", face: "oval", nose: "button",
      facialHair: "none", accessory: "badge", suit: "#5a4050", shirt: "#f2f0ea", tie: "#5a4050", tilt: 1 }),
  abbott: P("abbott", "Dennis Abbott", "Supervisory Agent, FBI",
    "Runs the Austin office by the book, and knows exactly which pages Jane has torn out.",
    "Waits three seconds before answering. Every time.",
    { skin: "#7c5033", hairColor: "#1a1410", hair: "bald", face: "square", nose: "broad",
      facialHair: "none", accessory: "badge", suit: "#2f3540", shirt: "#e8e2d4", tie: "#3f4a56", tilt: 0 }),
};

export function person(id: string): CanonPerson {
  const p = CAST[id];
  if (!p) throw new Error(`unknown cast member: ${id}`);
  return p;
}

/** Turn a roster of cast ids into the Suspect shape the board renders. */
export function lineup(ids: string[]): Suspect[] {
  return ids.map((id, seat) => {
    const p = person(id);
    return {
      seat,
      name: p.name,
      role: p.role,
      dossier: p.dossier,
      tell: p.tell,
      character: { ...p.character, id: p.id },
    };
  });
}
