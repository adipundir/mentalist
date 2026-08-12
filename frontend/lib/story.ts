/**
 * THE LIST — the campaign.
 *
 * Seven chapters following the real Red John arc, with the lineup shrinking the way the
 * suspect list does: 2,164 → 408 → 30 → **7** → 6 → 5 → 2 → 1. Chapters 4–7 use the
 * canonical rosters, eliminated in the canonical order.
 *
 * **Focus budgets are derived, not guessed.** A lineup of N needs at most `ceil(log2 N)`
 * splits to isolate one suspect, plus 2 for the control question that tells you whether to
 * believe your witness. Early chapters carry a little slack (which converts to Megapot
 * tickets); the last chapter has none at all.
 */

import type { CaseConfig } from "./case";

export interface Chapter extends CaseConfig {
  n: number;
  /** Episode-style title, in the show's shade-of-red convention. */
  title: string;
  /** Cast ids, in seat order. */
  roster: string[];
  opening: string;
  successText: string;
  failureText: string;
  /** A nudge from the team, shown on the board. */
  nudge: { speaker: string; line: string };
  /** Cast id of the culprit for this chapter. Only chapter 7 is truly Red John. */
  culprit: string;
}

export const CHAPTERS: Chapter[] = [
  {
    n: 4,
    title: "Cinnabar Sunday",
    label: "Chapter I",
    blurb: "Four people were in the house. One of them painted the wall.",
    suspects: 4,
    liars: 1,
    focus: 5,
    turnAt: 0,
    culprit: "wagner",
    roster: ["partridge", "mashburn", "wagner", "ardiles"],
    opening:
      "Sunday. The house still smells of lemon polish. Upstairs there is a woman who was alive on Friday, and above her bed a face in three-finger strokes, drying to rust. Four people had keys. One of them is lying to me, and one of them did it.",
    successText:
      "You say the name and he doesn't run — he beams, delighted to finally be seen. The strokes on the wall ran counter-clockwise. A copycat, then. Somewhere the original is reading about it, and is not amused.",
    failureText:
      "Wrong name. He lets you say it, lets the whole room turn and look at him, and says nothing at all. By morning the tape is down, the wall is painted over, and the face is drying on somebody else's ceiling.",
    nudge: {
      speaker: "lisbon",
      line: "Pick someone. Then point at someone else and ask if it was them. That's all this is.",
    },
  },
  {
    n: 6,
    title: "The Vermilion Hour",
    label: "Chapter II",
    blurb: "An informant silenced in custody, and a masked man reciting Blake.",
    suspects: 6,
    liars: 2,
    focus: 6,
    turnAt: 0,
    culprit: "cooper",
    roster: ["partridge", "harken", "mars", "cooper", "molinari", "morning"],
    opening:
      "Six people in the observation room and one of them has already killed on his behalf. Your informant died in protective custody with He is Ma finger-painted on the wall beside him. Kristina Frye's phone rings out into a room you can't picture. Somewhere a man in a plastic mask is warming up his Blake.",
    successText:
      "You name him and he recites The Tyger at you, all four lines, until Cho puts a hand on his shoulder. A tool, not the hand that held it. But tools remember who sharpened them — and this one talks.",
    failureText:
      "Wrong, and the interview ends politely. Two days later Kristina is found sitting upright in a stranger's house, talking gently to your dead wife, and she never comes all the way back from wherever he sent her.",
    nudge: {
      speaker: "vanpelt",
      line: "Ask two different people about the same man. If they disagree, one of them is lying to you.",
    },
  },
  {
    n: 8,
    title: "Oxblood Handshake",
    label: "Chapter III",
    blurb: "You shot the man who claimed to be him. Lorelei says you've already shaken the real one's hand.",
    suspects: 8,
    liars: 3,
    focus: 7,
    turnAt: 0,
    culprit: "haffner",
    roster: ["partridge", "bertram", "haffner", "kirkland", "smith", "stiles", "mcallister", "mashburn"],
    opening:
      "A shopping-mall food court. A man who knew what your wife's toenails looked like. Two rounds, and for a week you sleep like the innocent. Then a woman in an orange jumpsuit smiles at you through the glass and wonders aloud why you two never became friends the moment you shook hands.",
    successText:
      "Named, cuffed, gone. In the transport van he laughs and gives you the truth for free: he has shaken your hand. So has the man above him. So, somewhere in a doorway with a warm dry palm, has the real one.",
    failureText:
      "You say the wrong name and the food court empties around you like water. Somewhere a woman in an orange jumpsuit is being driven out of the world, and she takes the only true sentence in California with her.",
    nudge: {
      speaker: "cho",
      line: "Ask a man about himself. If he says yes, he's a liar — and an innocent one. Red John would never admit it.",
    },
  },
  {
    n: 7,
    title: "Seven Shades of Crimson",
    label: "Chapter IV",
    blurb: "The list of seven — and the DVD proving he had all seven names two months before you did.",
    suspects: 7,
    liars: 3,
    focus: 6,
    turnAt: 0,
    culprit: "partridge",
    roster: ["stiles", "bertram", "haffner", "smith", "kirkland", "mcallister", "partridge"],
    opening:
      "Seven. You have carried two thousand one hundred and sixty-four names down to seven, and not one of them is in a cell. A cop, a spook, a preacher, a fed, a bureaucrat, a ghoul, a sheriff. You recite them in the dark like a rosary. Then his DVD arrives and recites them back.",
    successText:
      "You name him and he goes quietly, which is its own kind of answer. Seven names, one face, and now you can hold all seven in your mouth at once without choking on any of them.",
    failureText:
      "Wrong name. Seven becomes six by his hand and not yours, and the disc in your pocket says he had your list two months before you finished writing it. He isn't narrowing. He's choosing.",
    nudge: {
      speaker: "lisbon",
      line: "Use 'is he even in this room' on someone. He always is — so their answer only tells you whether they lie.",
    },
  },
  {
    n: 6,
    title: "Carmine on Her Cheek",
    label: "Chapter V",
    blurb: "Partridge dies whispering Tyger, Tyger. Lisbon wakes with the signature drying on her face.",
    suspects: 6,
    liars: 4,
    focus: 5,
    turnAt: 3,
    culprit: "kirkland",
    roster: ["stiles", "bertram", "haffner", "smith", "kirkland", "mcallister"],
    opening:
      "Partridge dies on a dirt floor with two words in his mouth. Tyger. Tyger. Then Lisbon comes back to you breathing, with the signature drying on her cheek in another man's blood. Six names now. He crossed one off for you — which means he is helping you, which means he is very close.",
    successText:
      "You name him. Lisbon lets go of a breath she has been holding since the dirt floor. Six becomes five, and the arithmetic is finally running your way, which ought to frighten you considerably more than it does.",
    failureText:
      "Wrong. Lisbon scrubs her face for an hour and still finds him there at the hairline. He wanted you to see how near he can stand — and now he knows you cannot count.",
    nudge: {
      speaker: "rigsby",
      line: "Boss, four of these six would lie to a federal agent without blinking. Find your honest man first. Then make him earn his keep.",
    },
  },
  {
    n: 5,
    title: "Claret and Brimstone",
    label: "Chapter VI",
    blurb: "Five men, one shotgun, the house where it happened, and three dots on a left shoulder.",
    suspects: 5,
    liars: 4,
    focus: 5,
    turnAt: 3,
    culprit: "stiles",
    roster: ["stiles", "bertram", "haffner", "smith", "mcallister"],
    opening:
      "Five cars on the gravel outside the house where it happened. Five men in the room, the faded face still on the bedroom wall behind you, ten years old and grinning. A dying detective told you the last true thing anyone will: three dots, left shoulder. Shotgun up. Jackets off, gentlemen. Nobody leaves whole.",
    successText:
      "You name him before the fuse does. Five men, three tattoos, one truth — and for the length of a single heartbeat in that ruined bedroom you are the man who knows, and he is the man who has been known.",
    failureText:
      "Wrong name, wrong shoulder. The blast takes the house, the bedroom, the faded face, all of it. Three men are pronounced dead over dental records and one of them is lying to you even now.",
    nudge: {
      speaker: "cho",
      line: "There's one truthful mouth in that room. Waste him on a bad question and we're finished.",
    },
  },
  {
    n: 3,
    title: "Sanguine",
    label: "Chapter VII",
    blurb: "Three left, and two of them are officially dead. Ten years. Four questions.",
    suspects: 3,
    liars: 2,
    focus: 4,
    turnAt: 0,
    culprit: "mcallister",
    roster: ["bertram", "smith", "mcallister"],
    opening:
      "Three left, and two of them are officially dead. A church at the edge of a cemetery, candles going, a man in the front pew who badly wants to be believed. There is a pigeon in a box under the pew behind him and breadcrumbs in your pocket. Ten years. Four questions. Make them count.",
    successText:
      "You say his name and he stops pretending. Two blinks, and then two more. Then the creek, and the quiet, and ten years going out of you like a held breath. It is finished. It is nowhere near enough.",
    failureText:
      "Wrong. Cordero fires, the candles go over, and he walks out through the vestry into a decade you do not have. Ten years of work. Four questions. You spent every one of them on the wrong man.",
    nudge: {
      speaker: "abbott",
      line: "Mr. Jane. Whatever you're about to do in there — do it with the questions, and not with the gun.",
    },
  },
];

/** The blink code. Shown only after chapter VII is solved. */
export const FINALE: { kind: "action" | "jane" | "redjohn"; text: string }[] = [
  { kind: "action", text: "The pigeon comes up off your palm in a clatter of grey and he screams like a child, both arms thrown across his face." },
  { kind: "jane", text: "You told Sophie Miller it was heights. Very tidy. It was always birds." },
  { kind: "action", text: "You take the handgun from under the pew and put a round through his thigh. He goes down between the candles, still laughing at you." },
  { kind: "redjohn", text: "It's totally fair. Game's over and I won." },
  { kind: "jane", text: "It's not a game." },
  { kind: "action", text: "A woman comes up the aisle with a blade and buys him the vestry door. You break her wrist and go after him — across the cemetery, past a school bus, through a stranger's kitchen, down to a creek where the ground finally takes him." },
  { kind: "action", text: "You kneel on his chest. His phone spins away into the water. He can't get enough air behind his teeth to make a single word." },
  { kind: "jane", text: "Blink once for no. Twice for yes. Are you sorry you killed my wife and my daughter?" },
  { kind: "action", text: "Two blinks." },
  { kind: "jane", text: "Are you afraid to die?" },
  { kind: "action", text: "Two blinks." },
  { kind: "jane", text: "Good. Goodbye, Sheriff McAllister." },
];
