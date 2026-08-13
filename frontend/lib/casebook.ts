/**
 * THE CASEBOOK.
 *
 * Seven rooms and every word spoken in them. All of it public, all of it in the repository,
 * and none of it behind a wallet: a player opens a case and hears the whole room without
 * ever touching the chain.
 *
 * Each case carries exactly one account that is logically impossible, and where it sits in
 * the list is who gives it: `alibis[i]` belongs to `roster[i]`. That mapping is fixed and
 * public, which is the whole reason the room needs no chain call to open.
 *
 * That same index is the person id encrypted and handed to `Casebook.openCase`. It is worth
 * being precise about what the ciphertext buys, because it is not secrecy from a careful
 * reader: anyone who opens this file has the answer. It buys two other things. Settlement is
 * trustless, since the answer is fixed before the first bet and the operator can neither
 * move it nor argue with it afterwards. And every bet is private, so nobody can watch the
 * informed money and simply follow it.
 */

export interface Alibi {
  /** What he says, in his own words. */
  text: string;
  /** The one account in each case that cannot be true. Its index is the killer's person id. */
  impossible?: true;
}

export interface CaseFile {
  label: string;
  /** How many people are in the room. Matches the roster. */
  suspects: number;
  /** Exactly one account in every room cannot be true. */
  liars: 1;
  /** A word from the team, shown on the board. */
  nudge: { speaker: string; line: string };
  title: string;
  blurb: string;
  /** Where this room is. Drives the scene behind the lineup. */
  setting: string;
  opening: string;
  /** Cast ids, in seat order. */
  roster: string[];
  /** One per suspect, in seat order: `alibis[i]` is what `roster[i]` says. */
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
    nudge: { speaker: "lisbon", line: "Walk up to each of them and let them talk. One story in here cannot be true. Find that one." },
    blurb:
      "A Sunday house, a woman dead upstairs, a red face grinning off the wallpaper.",
    setting: "a shuttered Sunday parlour",
    opening:
      "A woman is dead upstairs. Someone painted a smiling face on her wall in her own blood, which is how Red John signs his work. Four people were at the house all afternoon, and it was her sister letting herself in at five who went up with the tea tray and started screaming. Each of the four will tell you where they were. One of them is describing something that could not have happened.",
    roster: ["partridge", "mashburn", "wagner", "ardiles"],
    alibis: [
      {
        text: "I was out on the back porch the whole hour, working my way down the pack because it was too wet to be anywhere else and I did not want the company. I only moved when the screaming started, and then I came in through the kitchen.",
      },
      {
        text: "I was in the kitchen with the radio going, drying the good glasses one at a time. When the noise came I dropped one straight into the sink, and you can go and look, the pieces are still sitting in there.",
      },
      {
        text: "I was asleep in the chair in the front room, out cold the whole hour, never stirred once, and it took the screaming to wake me. And my eyes never left those stairs the whole time, so I can tell you nobody went up them, not one soul.",
        impossible: true,
      },
      {
        text: "I went down to the cellar for another bottle and that door sticks in the wet, so I was a good while fighting it. I came back up with the wine still in my hand and the cork still in it.",
      },
    ],
    tell: "You cannot be out cold for an hour and keep watch on the stairs in the same breath. This one slept through the only thing worth seeing, then swore to it anyway.",
    successText:
      "You put the money on the sleeper, and the parlour went very quiet. Whoever swore to an hour of nothing had spent that hour upstairs with three fingers and a steady wrist, and there will be no sleeping tonight.",
    failureText:
      "You named the wrong one, and the wrong one wept, and your money was gone before the weeping stopped. Somewhere behind you a hand that had been gloved all afternoon was already reaching for its coat.",
  },
  {
    label: "Chapter II",
    title: "The Vermilion Hour",
    suspects: 6,
    liars: 1,
    nudge: { speaker: "vanpelt", line: "Listen for the one that argues with itself. A man in two places at once is a man with something to hide." },
    blurb:
      "An informant dies in protective custody. Six people were locked in with him, and one of their six stories cannot be true.",
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
        text: "I had the back room to myself with the bolt across the door, nobody in and nobody out, from the time the rain picked up until you people finally took that bolt off. And somewhere in the middle of all that, long after the bolt went across, I stood right over him out there on the linoleum and saw him face down with my own eyes, before one word of the shouting started.",
        impossible: true,
      },
      {
        text: "I was in the bathroom being sick from whatever was in that takeout they sent up before the rain came on. Head over the sink, better part of an hour, and I would rather you did not write that down.",
      },
    ],
    tell: "The story bolts the speaker into the back room for the whole hour and then, in the middle of that same hour, stands him over the body out on the linoleum. One man cannot be behind his own bolt and out on that floor at the same moment.",
    successText:
      "Bolted in the whole hour, and still standing over him on the linoleum: the story cannot carry both, and it comes apart in your hands. The smile on the wall stops being funny the moment the cuffs close. You collect your money while the rain thins out, and the man they fold into the back of the car is the one who painted it.",
    failureText:
      "The wrong wrists get the bracelets, and the face on the plaster goes right on grinning at everybody. Your stake walks out into the dark with the real one, who nods at the uniforms on the way past like a neighbour heading home.",
  },
  {
    label: "Chapter III",
    title: "Oxblood Handshake",
    suspects: 8,
    liars: 1,
    nudge: { speaker: "cho", line: "Eight stories, and one of them empties out a room that was not empty. Count the people, not the excuses." },
    blurb:
      "Eight alibis in a half dead mall food court. One of them cannot be true.",
    setting: "a half dead mall food court",
    opening:
      "A man spent six weeks telling this town he was Red John. He is now dead on the floor of a mall food court, with a smiling face drawn on the tile above him. Eight people were down that end of the mall when the gun went off, and all eight say they were busy with something else.",
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
        text: "I was down the far end by the window, watching the rain chew up the parking lot. By the time I got myself turned round it was already over.",
      },
      {
        text: "I was in the coffee line behind a fella with a stroller. Never did get my coffee, if that means anything to anybody.",
      },
      {
        text: "I was in the restroom with my hands under the cold tap. The bang came through the tile and my legs just quit on me.",
      },
      {
        text: "I was standing third in the line at the burger counter, waiting on the two ahead of me to order. There was not one other person in that whole place, not at the counters and not at the tables, just me and the smell off the fryers.",
        impossible: true,
      },
      {
        text: "I was at the corner table with the newspaper up in front of my face. I only put it down when the screaming started.",
      },
      {
        text: "I was on the payphone by the escalator, letting it ring out at my sister's place. Twenty rings, maybe thirty, me standing there like a fool with the receiver buzzing in my ear.",
      },
      {
        text: "I was over at the napkin stand, pulling them out one at a time because that dispenser only ever gives you the corner of one. Slow work, and I was in no hurry to be anywhere.",
      },
      {
        text: "A quarter rolled off my tray and went under the tables, so I went after it. I was down on my hands and knees when it happened.",
      },
    ],
    tell: "You cannot be standing third in a line with nobody in front of you, and that alibi puts the whole food court empty at the very same moment.",
    successText:
      "There was no line, and there was no waiting your turn, and now there is no story left. They walk him out past the fryers still talking, and the smile up on the tile keeps grinning like it knew all along.",
    failureText:
      "You point, the wrong wrists come up, and the room lets out a breath that costs you everything in your pocket. Somewhere behind you a fire door sighs shut, and the smile on the tile is still the only one in the building.",
  },
  {
    label: "Chapter IV",
    title: "Seven Shades of Crimson",
    suspects: 7,
    liars: 1,
    nudge: { speaker: "lisbon", line: "Watch the clock in each of them. One of these people has put more road behind him than the time he claims allows." },
    blurb:
      "Seven alibis, one impossible. Find the crack in the clock, name Red John.",
    setting: "a shuttered hotel lounge",
    opening:
      "A woman is dead in the room above this one, and the smiling face over her bed is still wet. Seven people were at the hotel when it happened, and every one of them is sitting in the lounge now. Each of them will account for the hour before she was found. Listen to the clock in each story. One of them is trying to fit far too much into far too little time.",
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
        text: "I stepped out on the back steps for a cigarette, ten minutes, maybe twelve. I stood out in the rain rather than come back in, because it was the only quiet I have had all day.",
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
        text: "The air in here had me choking, so I walked it off, the loop around the reservoir, three miles if it is a step. I was gone four minutes, five at the outside, and my coat is still dripping on the hook.",
        impossible: true,
      },
      {
        text: "I was in the washroom with the cold tap running over my wrists until my head came back to me. Five minutes of that and I walked straight in here.",
      },
      {
        text: "I was reading the racing page and marking it up with a pencil stub. I have never laid a dollar on one of those horses in my life, I just like the names.",
      },
    ],
    tell: "Nobody covers three miles on foot in four or five minutes, since even the fastest runners alive need better than twelve minutes for that distance and this was a walk in the rain, so the trip cannot fit inside the time claimed for it.",
    successText:
      "You put the money on the mouth that folded an hour into four minutes, and the smile drains out of the room like a light going off. Red John goes out through the rain in cuffs, and tonight the painted grin on the wall belongs to you.",
    failureText:
      "You name the wrong mouth and the row breathes out at once, every one of them except the one you pointed at. Somewhere inside that relief Red John is already turning toward the door, still wearing the four minutes that never happened.",
  },
  {
    label: "Chapter V",
    title: "Carmine on Her Cheek",
    suspects: 6,
    liars: 1,
    nudge: { speaker: "rigsby", line: "Boss, one of them is swearing to something they could not possibly have seen from where they say they stood." },
    blurb:
      "A red smile dries on a dead woman's cheek while six mouths swear they were elsewhere.",
    setting: "a dance hall's dirt cellar",
    opening:
      "A woman is dead on the cellar floor of a dance hall, with a smiling face drying on her cheek in her own blood, which is how Red John signs his work. Six people were on the premises the whole hour, and each will account for himself. One of those accounts cannot be true.",
    roster: ["stiles", "bertram", "haffner", "smith", "kirkland", "mcallister"],
    alibis: [
      {
        text: "I was out back by the ash cans, working down to the last cigarette in the pack. I stood there and watched the rain come off the roof edge in a sheet, and that is the whole of my hour.",
      },
      {
        text: "I never went down those stairs, not once, and that trapdoor was shut over them the whole time, and it is the only opening there is into that cellar. And still I watched somebody kneel down beside her and put that red on her cheek.",
        impossible: true,
      },
      {
        text: "I had the flat off the truck and the spare halfway onto the bolts. Go on, look at my hands, the grease is still sitting in the creases.",
      },
      {
        text: "I was on the payphone arguing with my sister about money, the same argument we have been having for eleven years. I spent the whole of it watching the rain come down the front glass, and then she hung up on me, she always hangs up on me.",
      },
      {
        text: "I was wrestling that piano crate down off the ramp on my own, an inch at a time, and it damn near went over on me twice. My back will tell you how long I was at it.",
      },
      {
        text: "I was in the washroom being sick, and I stayed in there a good while after, sweating it out. The liquor in this place has turned on me before.",
      },
    ],
    tell: "By his own telling the hatch was shut the whole hour and it is the only way to look into that cellar, so there was nothing for him to look through. A man cannot watch the mark being drawn in a room he has just finished sealing himself out of.",
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
    nudge: { speaker: "cho", line: "One of them describes a thing in a state it could not have been in. That is your man." },
    blurb:
      "Five men, five alibis, one mark on every left shoulder. Only one of them is lying.",
    setting: "the parlour where it happened",
    opening:
      "Five men, and the house where it all started. The face is still on the bedroom wall, ten years old now, and there is a fresh one drying in the room above them. The storm on Tuesday put the wires down, and nobody has got a sound out of the hall phone since. Each man will describe his evening.",
    roster: ["stiles", "bertram", "haffner", "smith", "mcallister"],
    alibis: [
      {
        text: "I was out on the back step with a cigarette, listening to the water hammer the bin lids. I only came in when the rain got under my collar, and that is the whole of it.",
      },
      {
        text: "I was in the kitchen with the tap running, waiting on it to go cold enough to drink. I stood there and put away two glasses of it, and my hands still would not settle.",
      },
      {
        text: "I dozed off in the chair by the stairs with the newspaper over my face. The shouting brought me up out of it all at once, and my neck has not forgiven me for it since.",
      },
      {
        text: "I rang my wife on the hall phone about half nine to say I would be late home, and then I stood about in the hall a while waiting on her to ring me back. She will tell you the same, go and ask her.",
        impossible: true,
      },
      {
        text: "I went up to change my shirt, the collar had gone soft on me, and I took my time about it. Buttons are slow work when you have had a few.",
      },
    ],
    tell: "The wires came down on Tuesday and the hall phone has not carried a sound since, so the call he swears he made on it tonight never went anywhere at all.",
    successText:
      "The room goes quiet the way rooms do when the one man who should be talking finds he has nothing left to say. Red John looks at you like you have paid him a compliment, and the money comes home.",
    failureText:
      "You point, and a man goes white who has done nothing worse than be in this house tonight. Somewhere behind him another one laughs, small and pleased, and walks out into the rain with your stake.",
  },
  {
    label: "Chapter VII",
    title: "Sanguine",
    suspects: 3,
    liars: 1,
    nudge: { speaker: "abbott", line: "Three left, Mr. Jane. Only one of them is telling you something that cannot be true. Take your time." },
    blurb:
      "The last room, the last three faces, and one alibi that cannot be true.",
    setting: "a chapel beside the graves",
    opening:
      "Three left. A church at the edge of a cemetery, with a body in the side chapel and a red smile drying on the plaster above it, and the last hour is the only hour that matters. Red John is sitting in one of these three chairs, and only one of them is going to tell you something that cannot be true.",
    roster: ["bertram", "smith", "mcallister"],
    alibis: [
      {
        text: "I never got past the lychgate. Rain came down like somebody kicked a bucket over, so I stood in under that little roof and smoked two, maybe three, watching the road for headlights that never came.",
      },
      {
        text: "I was up the tower steps most of that hour, out of everybody's way, and there is nothing up there but pigeons and the weather coming through the louvres. I came down when I heard people moving about below.",
      },
      {
        text: "I shut myself in the vestry when the rain started and I bolted the door behind me. Nobody else in there the whole hour, just me and that chess set they keep by the stove, and I got beaten in under twenty moves, which tells you exactly what kind of night I was having.",
        impossible: true,
      },
    ],
    tell: "He bolted himself into the vestry with nobody else in it, then says he lost a game of chess. Chess takes two, and by his own account there was no one on the other side of the board.",
    successText:
      "You lay the money on the one who lost a game to nobody, and the whole church stops breathing at once. The rain quits, the smile finally comes off, and after all these years Red John has a face to go with it.",
    failureText:
      "You point, the money goes down, and the wrong mouth falls open in horror. The right one does not move at all, because he knew you would look everywhere in this room except at the empty chair across the board.",
  },
];

