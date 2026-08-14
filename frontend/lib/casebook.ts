/**
 * THE CASEBOOK.
 *
 * Seven rooms and every word spoken in them. All of it public, all of it in the repository,
 * and none of it behind a wallet: a player opens a case and hears the whole room without
 * ever touching the chain.
 *
 * The answer key does not live here. The roster and alibis are public game content; the
 * person id used to open the on-chain case is encrypted by the owner from local env and the
 * post-settlement explanation is loaded by the API from server-only env.
 */

export interface Alibi {
  /** What he says, in his own words. */
  text: string;
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
}

export const CASEBOOK: CaseFile[] = [
  {
    label: "Chapter I",
    title: "Cinnabar Sunday",
    suspects: 4,
    liars: 1,
    nudge: {
      speaker: "lisbon",
      line: "Walk up to each of them and let them talk. One story in here cannot be true. Find that one.",
    },
    blurb:
      "A Sunday house, a woman dead upstairs, a red face grinning off the wallpaper.",
    setting: "a shuttered Sunday parlour",
    opening:
      "A woman is dead upstairs. Someone painted a smiling face on her wall in her own blood, which is how Red John signs his work. Four people were at the house all afternoon, and it was her sister letting herself in at five who went up with the tea tray and started screaming. Each of the four will tell you where they were. One of them is describing something that could not have happened.",
    roster: ["partridge", "mashburn", "wagner", "ardiles"],
    alibis: [
      {
        text: "I was out on the back porch the whole hour with my cards, and only came in when the screaming started.",
      },
      {
        text: "I was in the kitchen drying glasses. When the screaming started I dropped one in the sink, and the pieces are still there.",
      },
      {
        text: "I was out cold in the front room chair the whole hour, and my eyes never left those stairs. Nobody went up.",
      },
      {
        text: "I went to the cellar for another bottle, and that sticking door kept me down there a good while.",
      },
    ],
  },
  {
    label: "Chapter II",
    title: "The Vermilion Hour",
    suspects: 6,
    liars: 1,
    nudge: {
      speaker: "vanpelt",
      line: "Listen for the one that argues with itself. A man in two places at once is a man with something to hide.",
    },
    blurb:
      "An informant dies in protective custody. Six people were locked in with him, and one of their six stories cannot be true.",
    setting: "a shuttered safe house",
    opening:
      "The witness who was going to name Red John is dead on the floor of a safe house. Six people were locked in here with him. Nobody came in and nobody went out, so one of these six killed him, and there is a smiling face on the wall to prove whose work it was.",
    roster: ["partridge", "harken", "mars", "cooper", "molinari", "morning"],
    alibis: [
      {
        text: "I was at the back window smoking, watching the rain wreck that alley. Two cigarettes, and that was my hour.",
      },
      {
        text: "I had the crossword and a coffee going cold in the front room. Four across is still empty, go and look.",
      },
      {
        text: "I was down in the basement feeding quarters to the dryer. That hum was all I heard until the shouting started.",
      },
      {
        text: "I was up on the second landing waiting on ball scores, my back to the hall. I saw nothing, and I will not pretend otherwise.",
      },
      {
        text: "I had the bolt across the back room door the whole hour, nobody in and nobody out. And halfway through that, I stood right over him out there on the linoleum and saw him face down, before any shouting started.",
      },
      {
        text: "I was in the bathroom being sick from that takeout, head over the sink most of the hour. I would rather you left that out.",
      },
    ],
  },
  {
    label: "Chapter III",
    title: "Oxblood Handshake",
    suspects: 8,
    liars: 1,
    nudge: {
      speaker: "cho",
      line: "Eight stories, and one of them empties out a room that was not empty. Count the people, not the excuses.",
    },
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
        text: "I was down the far end by the window, watching the rain. By the time I turned round it was over.",
      },
      {
        text: "I was in the coffee line behind a fella with a stroller. Never did get my coffee.",
      },
      {
        text: "I was in the restroom, hands under the cold tap. The bang came through the tile and my legs quit.",
      },
      {
        text: "I was standing third in the burger line, two people ahead of me. There was not one other person in that whole food court.",
      },
      {
        text: "I was at the corner table with the newspaper up in front of my face. Put it down when the screaming started.",
      },
      {
        text: "I was on the payphone by the escalator, letting my sister's place ring out. Twenty rings, maybe thirty.",
      },
      {
        text: "I was over at the napkin stand, pulling them out one at a time because that dispenser only gives you a corner.",
      },
      {
        text: "A quarter rolled off my tray and under the tables. I was down on my hands and knees when it happened.",
      },
    ],
  },
  {
    label: "Chapter IV",
    title: "Seven Shades of Crimson",
    suspects: 7,
    liars: 1,
    nudge: {
      speaker: "lisbon",
      line: "Watch the clock in each of them. One of these people has put more road behind him than the time he claims allows.",
    },
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
        text: "Out on the back steps with a cigarette, ten minutes, maybe twelve. I stayed in the rain rather than come back in.",
      },
      {
        text: "I went down the cellar to shut that latch that bangs in a storm. Took a good quarter of an hour.",
      },
      {
        text: "I was on the telephone to my sister the whole time, about nothing at all. She talks, I listen.",
      },
      {
        text: "I sat by the window counting cars on the wet street. Sounds foolish out loud, but a person has to do something.",
      },
      {
        text: "I needed air, so I walked the reservoir loop in the rain, three miles if it is a step. Gone four minutes, five at the outside.",
      },
      {
        text: "I was in the washroom with the cold tap running over my wrists till my head cleared. Five minutes, then straight in here.",
      },
      {
        text: "I was marking up the racing page with a pencil stub. I have never bet a dollar, I just like the names.",
      },
    ],
  },
  {
    label: "Chapter V",
    title: "Carmine on Her Cheek",
    suspects: 6,
    liars: 1,
    nudge: {
      speaker: "rigsby",
      line: "Boss, one of them is swearing to something they could not possibly have seen from where they say they stood.",
    },
    blurb:
      "A red smile dries on a dead woman's cheek while six mouths swear they were elsewhere.",
    setting: "a dance hall's dirt cellar",
    opening:
      "A woman is dead on the cellar floor of a dance hall, with a smiling face drying on her cheek in her own blood, which is how Red John signs his work. Six people were on the premises the whole hour, and each will account for himself. One of those accounts cannot be true.",
    roster: ["stiles", "bertram", "haffner", "smith", "kirkland", "mcallister"],
    alibis: [
      {
        text: "I was out back by the ash cans, smoking my way down to the last one in the pack. That was my whole hour.",
      },
      {
        text: "I never once went down, and that trapdoor, the only way into the cellar, stayed shut the whole hour. Still I watched somebody kneel and put that red on her cheek.",
      },
      {
        text: "I had the flat off the truck and the spare halfway onto the bolts. Look at my hands, the grease is still in the creases.",
      },
      {
        text: "I was on the payphone arguing with my sister about money, same argument as always, until she hung up on me.",
      },
      {
        text: "I was wrestling that piano crate down the ramp on my own, an inch at a time. My back will tell you how long.",
      },
      {
        text: "I was in the washroom being sick, and I stayed in there a good while after, sweating it out.",
      },
    ],
  },
  {
    label: "Chapter VI",
    title: "Claret and Brimstone",
    suspects: 5,
    liars: 1,
    nudge: {
      speaker: "cho",
      line: "One of them describes a thing in a state it could not have been in. That is your man.",
    },
    blurb:
      "Five men, five alibis, one mark on every left shoulder. Only one of them is lying.",
    setting: "the parlour where it happened",
    opening:
      "Five men, and the house where it all started. The face is still on the bedroom wall, ten years old now, and there is a fresh one drying in the room above them. The storm on Tuesday put the wires down, and nobody has got a sound out of the hall phone since. Each man will describe his evening.",
    roster: ["stiles", "bertram", "haffner", "smith", "mcallister"],
    alibis: [
      {
        text: "I was out on the back step with a cigarette until the rain got under my collar.",
      },
      {
        text: "I was in the kitchen running the tap cold, and I put away two glasses of it. My hands still would not settle.",
      },
      {
        text: "I dozed off in the chair by the stairs with the newspaper over my face, and the shouting brought me up out of it.",
      },
      {
        text: "I rang my wife on the hall phone about half nine to say I would be late home. Ask her.",
      },
      {
        text: "I went up to change my shirt, the collar had gone soft, and buttons are slow work when you have had a few.",
      },
    ],
  },
  {
    label: "Chapter VII",
    title: "Sanguine",
    suspects: 3,
    liars: 1,
    nudge: {
      speaker: "abbott",
      line: "Three left, Mr. Jane. Only one of them is telling you something that cannot be true. Take your time.",
    },
    blurb:
      "The last room, the last three faces, and one alibi that cannot be true.",
    setting: "a chapel beside the graves",
    opening:
      "Three left. A church at the edge of a cemetery, with a body in the side chapel and a red smile drying on the plaster above it, and the last hour is the only hour that matters. Red John is sitting in one of these three chairs, and only one of them is going to tell you something that cannot be true.",
    roster: ["bertram", "smith", "mcallister"],
    alibis: [
      {
        text: "I never got past the lychgate. Stood under that little roof smoking, watching the road for headlights that never came.",
      },
      {
        text: "I was up the tower steps most of that hour, just pigeons and the weather, and came down when I heard people below.",
      },
      {
        text: "I bolted myself into the vestry when the rain started, nobody else in there the whole hour, and I lost at chess in under twenty moves.",
      },
    ],
  },
];
