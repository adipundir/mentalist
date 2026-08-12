/**
 * The blink code.
 *
 * All that survives of the old story file. The cases themselves moved to `casebook.ts` when
 * the game stopped being "is the killer in this set" and became "one of these accounts
 * cannot be true", and the chapter data went with them.
 */

export const FINALE: { kind: "action" | "jane" | "redjohn"; text: string }[] = [
  { kind: "action", text: "The pigeon comes up off your palm in a clatter of grey and he screams like a child, both arms thrown across his face." },
  { kind: "jane", text: "You told Sophie Miller it was heights. Very tidy. It was always birds." },
  { kind: "action", text: "You take the handgun from under the pew and put a round through his thigh. He goes down between the candles, still laughing at you." },
  { kind: "redjohn", text: "It's totally fair. Game's over and I won." },
  { kind: "jane", text: "It's not a game." },
  { kind: "action", text: "A woman comes up the aisle with a blade and buys him the vestry door. You break her wrist and go after him, across the cemetery, past a school bus, through a stranger's kitchen, down to a creek where the ground finally takes him." },
  { kind: "action", text: "You kneel on his chest. His phone spins away into the water. He can't get enough air behind his teeth to make a single word." },
  { kind: "jane", text: "Blink once for no. Twice for yes. Are you sorry you killed my wife and my daughter?" },
  { kind: "action", text: "Two blinks." },
  { kind: "jane", text: "Are you afraid to die?" },
  { kind: "action", text: "Two blinks." },
  { kind: "jane", text: "Good. Goodbye, Sheriff McAllister." },
];
