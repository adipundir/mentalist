/**
 * THE CASEBOOK.
 *
 * Seven rooms, and everything in them that is allowed to be public: who is standing there,
 * what the place looks like, and every word any of them says.
 *
 * **The answer is not in this file, and cannot be.** Each case carries one account that is
 * logically impossible, and it is always written last. Which *person* gives that account is
 * fixed per case and stored on chain as a ciphertext, so every player is hunting the same
 * man and nobody, including whoever wrote the case, can read the answer off the repository
 * or off the explorer.
 *
 * That is also why there is no database. The cases are content and belong in the repository.
 * The one secret worth keeping lives on chain, where keeping it actually means something.
 */

export interface Alibi {
  /** What he says, in his own words. */
  text: string;
  /** The one account in each case that cannot be true. Always the last entry. */
  impossible?: true;
}

export interface CaseFile {
  label: string;
  /** Contract parameters. Derived from the roster: one seat, one account, one question. */
  suspects: number;
  /** Exactly one account in every room cannot be true. */
  liars: 1;
  focus: number;
  /** The turncoat is off everywhere: with one account each there is nothing to re-ask. */
  turnAt: 0;
  /** A word from the team, shown on the board. */
  nudge: { speaker: string; line: string };
  title: string;
  blurb: string;
  /** Where this room is. Drives the scene behind the lineup. */
  setting: string;
  opening: string;
  /** Cast ids, in seat order. */
  roster: string[];
  /** One per suspect. The impossible one is last, matching the contract's final slot. */
  alibis: Alibi[];
  /** Why that account cannot be true. Shown only once the case is closed. */
  tell: string;
  successText: string;
  failureText: string;
}

export const CASEBOOK: CaseFile[] = [
  {
    label: "Chapter I",
    title: "Cinnabar Sunday",
    suspects: 4,
    liars: 1,
    focus: 4,
    turnAt: 0,
    nudge: { speaker: "lisbon", line: "Walk up to each of them and let them talk. One story in here cannot be true. Find that one." },
    blurb:
      "A Sunday house, a woman dead upstairs, a red face grinning off the wallpaper.",
    setting: "a shuttered Sunday parlour",
    opening:
      "A woman is dead upstairs. Someone painted a smiling face on her wall in her own blood, which is how Red John signs his work. Four people were in the house all afternoon. Each of them will tell you where they were. One of them is describing something that could not have happened.",
    roster: ["partridge", "mashburn", "wagner", "ardiles"],
    alibis: [
      {
        text: "I was out on the back porch with a cigarette, watching the rain come off the gutter in a rope. I got through two of them, maybe three, and then the screaming started and I came in through the kitchen.",
      },
      {
        text: "I was in the kitchen with the radio going, drying the good glasses one at a time. When the noise came I dropped one, and you can go and look, the pieces are still sitting in the sink.",
      },
      {
        text: "I went down to the cellar for another bottle and that door sticks in the wet, so I was a good while fighting it. I came back up with the wine still in my hand and the cork still in it.",
      },
      {
        text: "I was asleep in the chair in the front room, out cold the whole hour, never stirred once, and it took the screaming to wake me. And I can swear to you nobody went up those stairs in all that time, not one soul.",
        impossible: true,
      },
    ],
    tell: "You cannot be out cold for an hour and keep watch on the stairs in the same breath. This one slept through the only thing worth seeing, then swore to it anyway.",
    successText:
      "You put the money on the sleeper, and the parlour went very quiet. Whoever swore to an hour of nothing had spent that hour upstairs with three fingers and a steady wrist, and there will be no sleeping tonight.",
    failureText:
      "You named the wrong one, and the wrong one wept, and your money was gone before the weeping stopped. Somewhere behind you a hand with paint dried under the nail was already reaching for its coat.",
  },
  {
    label: "Chapter II",
    title: "The Vermilion Hour",
    suspects: 6,
    liars: 1,
    focus: 6,
    turnAt: 0,
    nudge: { speaker: "vanpelt", line: "Listen for the one that argues with itself. A man in two places at once is a man with something to hide." },
    blurb:
      "An informant dies in protective custody. Six alibis, and one of them puts its owner in two places at once.",
    setting: "a shuttered safe house",
    opening:
      "The witness who was going to name Red John is dead on the floor of a safe house. Six people were locked in here with him. Nobody came in and nobody went out, so one of these six killed him, and there is a smiling face on the wall to prove whose work it was.",
    roster: ["partridge", "harken", "mars", "cooper", "molinari", "morning"],
    alibis: [
      {
        text: "I was at the back window with a cigarette going, watching the rain make a mess of that alley. Smoked it down to the filter, lit another, and that is the whole of my hour.",
      },
      {
        text: "I had the crossword and a cup of coffee going cold on the front room table. Four across is still empty, you can walk in there and look at it yourself.",
      },
      {
        text: "I was down in the basement waiting on the dryer, feeding it quarters like a slot machine that never pays out. That hum was the only thing I heard until the shouting started.",
      },
      {
        text: "I was on the second landing with the radio turned way down, waiting on the ball scores. My back was to the hall the entire time, so I saw exactly nothing, and I am not going to pretend otherwise.",
      },
      {
        text: "I was in the bathroom being sick from whatever was in that takeout they sent up. Head over the sink, better part of an hour, and I would rather you did not write that down.",
      },
      {
        text: "I had the back room to myself with the bolt across the door, nobody in and nobody out, from the time the rain picked up until you people finally took that bolt off. And I stood right over him out there on the linoleum, saw him face down with my own eyes, before one word of the shouting started.",
        impossible: true,
      },
    ],
    tell: "The story seals the speaker behind a bolted door for the entire hour and then puts that same person standing over the body out in the open before anyone raised the alarm, and both of those cannot be true at once.",
    successText:
      "Bolted in the whole hour, and still standing over him on the linoleum: the story cannot carry both, and it comes apart in your hands. The smile on the wall stops being funny the moment the cuffs close. You collect your money while the rain thins out, and somewhere past the squad cars Red John is one friend lighter.",
    failureText:
      "The wrong wrists get the bracelets, and the face on the plaster goes right on grinning at everybody. Your stake walks out into the dark with the real one, who nods at the uniforms on the way past like a neighbour heading home.",
  },
  {
    label: "Chapter III",
    title: "Oxblood Handshake",
    suspects: 8,
    liars: 1,
    focus: 8,
    turnAt: 0,
    nudge: { speaker: "cho", line: "Eight stories, and one of them describes a room that was not there. Check the place, not the person." },
    blurb:
      "Eight alibis in a half dead mall food court. One of them cannot be true.",
    setting: "a half dead mall food court",
    opening:
      "A man spent six weeks telling this town he was Red John. He is now dead on the floor of a mall food court, with a smiling face drawn above him. Eight people were standing around when the gun went off, and all eight say they were busy with something else.",
    roster: [
      "partridge",
      "bertram",
      "haffner",
      "kirkland",
      "smith",
      "stiles",
      "mcallister",
      "mashburn",
    ],
    alibis: [
      {
        text: "I was down the far end by the window, watching the rain chew up the parking lot. I never turned around, not once, I swear that to you.",
      },
      {
        text: "I was in the coffee line behind a fella with a stroller. Never did get my coffee, if that means anything to anybody.",
      },
      {
        text: "I was in the restroom with my hands under the cold tap. The bang came through the tile and my legs just quit on me.",
      },
      {
        text: "I was at the corner table with the newspaper up in front of my face. I only put it down when the screaming started.",
      },
      {
        text: "I was on the payphone by the escalator, letting it ring out at my sister's place. Twenty rings, maybe thirty, me standing there like a fool with the receiver buzzing in my ear.",
      },
      {
        text: "I was at the sauce station filling those little paper cups with ketchup. Slow work, and I was in no hurry to be anywhere.",
      },
      {
        text: "A quarter rolled off my tray and went under the tables, so I went after it. I was down on my hands and knees when it happened.",
      },
      {
        text: "I was standing third in the line at the burger counter, waiting on the two ahead of me to order. Whole court was dead, not one other soul in it, just me and the smell off the fryers.",
        impossible: true,
      },
    ],
    tell: "You cannot be standing third in a line with nobody in front of you, and that alibi puts the whole food court empty at the very same moment.",
    successText:
      "There was no line, and there was no waiting your turn, and now there is no story left. They walk him out past the fryers still talking, and the ketchup smile on the tile keeps grinning like it knew all along.",
    failureText:
      "You point, the wrong wrists come up, and the room lets out a breath that costs you everything in your pocket. Somewhere behind you a fire door sighs shut, and the smile on the floor is still the only one in the building.",
  },
  {
    label: "Chapter IV",
    title: "Seven Shades of Crimson",
    suspects: 7,
    liars: 1,
    focus: 7,
    turnAt: 0,
    nudge: { speaker: "lisbon", line: "Watch the clock in each of them. Somebody is going to fit an hour into ten minutes." },
    blurb:
      "Seven alibis, one impossible. Find the crack in the clock, name Red John.",
    setting: "a shuttered hotel lounge",
    opening:
      "Seven names, and Red John is one of them. They are all sitting in a hotel lounge, and each of them will account for the last hour. Listen to the clock in each story. One of them is trying to fit far too much into far too little time.",
    roster: [
      "stiles",
      "bertram",
      "haffner",
      "smith",
      "kirkland",
      "mcallister",
      "partridge",
    ],
    alibis: [
      {
        text: "I stepped out on the back steps for a cigarette, ten minutes, maybe twelve. I stood in the rain rather than come back in, because the air in this place turns my stomach.",
      },
      {
        text: "I went down the cellar steps to shut that window latch, the one that bangs the whole night whenever it storms. Took me a good quarter of an hour with the crates stacked up in front of it.",
      },
      {
        text: "I was on the telephone the entire time, to my sister, about nothing at all. She talks and I listen, that is how it has always been with the two of us.",
      },
      {
        text: "I sat by the window counting the cars going past on the wet street. It sounds foolish said out loud, I know that, but a person has to do something while they wait.",
      },
      {
        text: "I was in the washroom with the cold tap running over my wrists until my head came back to me. Five minutes of that and I walked straight in here.",
      },
      {
        text: "I was reading the racing page and marking it up with a pencil stub. I have never laid a dollar on one of those horses in my life, I just like the names.",
      },
      {
        text: "The air in here had me choking, so I walked it off, the whole loop around the reservoir and back, three miles if it is a step. I was gone four minutes, five at the outside, and my coat is still dripping on the hook.",
        impossible: true,
      },
    ],
    tell: "Nobody covers three miles on foot in four or five minutes, since even the fastest runners alive need better than twelve minutes for that distance and this was a walk in the rain, so the trip cannot fit inside the time claimed for it.",
    successText:
      "You put the money on the mouth that folded an hour into four minutes, and the smile drains out of the room like a light going off. Red John goes out through the rain in cuffs, and tonight the painted grin on the wall belongs to you.",
    failureText:
      "You name the wrong mouth and the whole row breathes out at once, all seven of them, relieved together. Somewhere inside that relief Red John is already turning toward the door, still wearing the four minutes that never happened.",
  },
  {
    label: "Chapter V",
    title: "Carmine on Her Cheek",
    suspects: 6,
    liars: 1,
    focus: 6,
    turnAt: 0,
    nudge: { speaker: "rigsby", line: "Boss, one of them is swearing to something they could not possibly have seen from where they say they stood." },
    blurb:
      "A red smile dries on a dead woman's cheek while six mouths swear they were elsewhere.",
    setting: "a dance hall's dirt cellar",
    opening:
      "A man died on a cellar floor and the smiling face is drying on the wall above him. Six people were in the building. Each will tell you where they stood and what they saw, and one of them claims to have seen something they could not possibly have seen from there.",
    roster: ["stiles", "bertram", "haffner", "smith", "kirkland", "mcallister"],
    alibis: [
      {
        text: "I was out back by the ash cans, working down to the last cigarette in the pack. All I heard the whole time was the rain drumming on the lids.",
      },
      {
        text: "I had the flat off the truck and the spare halfway onto the bolts. Go on, look at my hands, the grease is still sitting in the creases.",
      },
      {
        text: "I was on the payphone arguing with my sister about money, the same argument we have been having for eleven years. She hung up on me, she always hangs up on me.",
      },
      {
        text: "Me and the delivery kid were wrestling that piano crate off the ramp. It takes two people to move a thing like that, and he will tell you so himself.",
      },
      {
        text: "I was in the washroom being sick, and I stayed in there a good while after, sweating it out. The liquor in this place has turned on me before.",
      },
      {
        text: "I never went down those stairs, not once, I was up top the whole time with the trapdoor shut over them. And I watched somebody kneel down there and put that red on her cheek.",
        impossible: true,
      },
    ],
    tell: "You cannot see through a shut trapdoor and a solid floor, so whoever swears they stayed up top and still watched the mark being drawn below saw nothing at all.",
    successText:
      "You put the name to the face and the bracelets go on while the carmine is still tacky. The smile on her cheek stops being a signature and starts being evidence.",
    failureText:
      "Wrong mouth, and the room knows it before you do. The one you wanted is already up the stairs and into the rain, and by morning there is a fresh smile drying on a fresh cheek.",
  },
  {
    label: "Chapter VI",
    title: "Claret and Brimstone",
    suspects: 5,
    liars: 1,
    focus: 5,
    turnAt: 0,
    nudge: { speaker: "cho", line: "One of them describes a thing in a state it could not have been in. That is your man." },
    blurb:
      "Five men, five alibis, one mark on every left shoulder. Only one of them is lying.",
    setting: "the parlour where it happened",
    opening:
      "Five men, and the house where it all started. The face is still on the bedroom wall, ten years old now. Each man will describe his evening. One of them describes an object in a state it could not have been in.",
    roster: ["stiles", "bertram", "haffner", "smith", "mcallister"],
    alibis: [
      {
        text: "I was out on the back step with a cigarette, watching the water come off the gutter in a rope. I came in when it burned down to my fingers, and that is the whole of it.",
      },
      {
        text: "I was in the kitchen with the tap running, waiting on it to go cold enough to drink. I stood there and put away two glasses of it, and my hands still would not settle.",
      },
      {
        text: "I dozed off in the chair by the stairs with the newspaper over my face. The bang brought me up out of it and then there was shouting, and my neck has not forgiven me for it since.",
      },
      {
        text: "I went up to change my shirt, the collar had gone soft on me, and I took my time about it. Buttons are slow work when you have had a few.",
      },
      {
        text: "The storm put the wires down on Tuesday and that hall phone has been dead ever since, not so much as a click left in it. I rang my wife on it tonight about half nine to say I would be late home, and she will tell you the same.",
        impossible: true,
      },
    ],
    tell: "He swears the hall line has been dead since Tuesday, and a dead line carries nothing, so the call he says he made on it tonight could never have gone anywhere.",
    successText:
      "The room goes quiet the way rooms do when the wrong man finally breathes out. Red John looks at you like you have paid him a compliment, and the money comes home.",
    failureText:
      "You point, and a man goes white who has done nothing worse than drink. Somewhere behind him another one laughs, small and pleased, and walks out into the rain with your stake.",
  },
  {
    label: "Chapter VII",
    title: "Sanguine",
    suspects: 3,
    liars: 1,
    focus: 3,
    turnAt: 0,
    nudge: { speaker: "abbott", line: "Three left, Mr. Jane. Only one of them is telling you something that cannot be true. Take your time." },
    blurb:
      "The last room, the last three faces, and one alibi that cannot be true.",
    setting: "a chapel beside the graves",
    opening:
      "Three left, and two of them are supposed to be dead already. A church at the edge of a cemetery, and Red John is sitting in one of these three chairs. Only one of them is going to tell you something that cannot be true.",
    roster: ["bertram", "smith", "mcallister"],
    alibis: [
      {
        text: "I never got past the lychgate. Rain came down like somebody kicked a bucket over, so I stood in under that little roof and smoked two, maybe three, watching the road for headlights that never came.",
      },
      {
        text: "I was up the tower the whole time with the rope off the wheel and grease to my elbows, and there is nothing up there but pigeons and weather. I only came down because of the shouting, and by then it was all over, wasn't it.",
      },
      {
        text: "I shut myself in the vestry when the rain started and I bolted the door behind me. Nobody else in there the whole hour, just me and that little board they keep by the stove, and I got beaten before the candle was half down, which tells you exactly what kind of night I was having.",
        impossible: true,
      },
    ],
    tell: "He bolted himself in with nobody, then says he was beaten across the board. Chess takes two, and there was no one sitting on the other side of it.",
    successText:
      "You lay the money on the one who lost a game to nobody, and the whole church stops breathing at once. The rain quits, the smile finally comes off, and after all these years Red John has a face to go with it.",
    failureText:
      "You point, the money goes down, and the wrong mouth falls open in horror. The right one does not move at all, because he knew you would look everywhere in this room except at the empty chair across the board.",
  },
];

/** How many people are in a given room. */
export const suspectsIn = (c: CaseFile) => c.roster.length;
