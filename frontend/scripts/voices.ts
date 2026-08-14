/**
 * Pre-records every alibi in the casebook with Sarvam's TTS.
 *
 * The game used to speak through the browser's own `speechSynthesis`, which meant the voice
 * of a suspect was whatever the visitor's machine happened to ship: a different reading on
 * every computer, and on macOS a list of novelty voices so unusable they had to be excluded
 * by name. A recording is the same performance for everybody, it is a better performance,
 * and it costs the player no CPU. The browser path stays as a fallback for any line that has
 * no file, so a missing recording is a quieter game rather than a broken one.
 *
 * Idempotent: a line whose file already exists is skipped, so a re-run costs nothing and
 * only new or changed cases spend credits. Delete a file to have it regenerated.
 *
 *   SARVAM_API_KEY=... pnpm --filter frontend voices
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CASEBOOK } from "../lib/casebook";
import { lineup } from "../lib/canon";

const KEY = process.env.SARVAM_API_KEY;
if (!KEY) throw new Error("SARVAM_API_KEY is not set");

const OUT = join(process.cwd(), "public", "vo");

/**
 * Who reads for whom.
 *
 * `bulbul:v3` ships forty-four named voices (v2 has seven, which forced repeats inside the
 * bigger rooms) and describes none of them, so the split below is by name and by ear. Both pools are deeper than the largest room in the casebook, which is the
 * point: `seat % pool.length` then gives every person in a case a voice of their own, and a
 * player comparing two accounts is never comparing two readings by the same mouth. Across
 * cases they repeat, which nobody notices and nothing depends on.
 */
const FEMININE = [
  "ritu", "priya", "neha", "pooja", "simran", "kavya", "ishita", "shreya",
  "roopa", "tanya", "shruti", "suhani", "kavitha", "rupali", "niharika",
] as const;

const MASCULINE = [
  "aditya", "rahul", "rohan", "amit", "dev", "varun", "manan",
  "sumit", "kabir", "aayan", "shubh", "advait", "anand", "tarun", "sunny",
  "mani", "gokul", "vijay", "mohit", "rehan", "soham",
] as const;

/**
 * The narrator, and only ever this one.
 *
 * Kept out of both pools above so the voice telling you about the room is never also a voice
 * standing in it, and fixed across all seven cases: the narrator is one person, and a story
 * whose teller changes between chapters has no teller at all.
 */
const NARRATOR = "ratan";

function speakerFor(seat: number, feminine: boolean | undefined): string {
  const pool = feminine ? FEMININE : MASCULINE;
  return pool[seat % pool.length]!;
}

async function record(text: string, speaker: string, file: string) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: "en-IN",
      speaker,
      model: "bulbul:v3",
      // Slower than default. These are people accounting for themselves to a detective, not
      // reading a notification.
      pace: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const { audios } = (await res.json()) as { audios: string[] };

  // Sarvam returns 22kHz WAV, which is six times the size of the same thing as AAC. The wav
  // is a scratch file: only the m4a is committed and served.
  const wav = `${file}.wav`;
  writeFileSync(wav, Buffer.from(audios[0]!, "base64"));
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "48000", wav, file]);
  unlinkSync(wav);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let made = 0;
  let skipped = 0;

  const cue = async (file: string, text: string, speaker: string, label: string) => {
    const path = join(OUT, `${file}.m4a`);
    if (existsSync(path)) {
      skipped += 1;
      return;
    }
    await record(text, speaker, path);
    made += 1;
    console.log(`${label} → ${speaker}`);
  };

  for (const [caseId, chapter] of CASEBOOK.entries()) {
    const people = lineup(chapter.roster);

    // The accounts: one voice per person, unique inside the room.
    for (const [seat, alibi] of chapter.alibis.entries()) {
      const speaker = speakerFor(seat, people[seat]?.character.feminine);
      await cue(`c${caseId}-s${seat}`, alibi.text, speaker, `case ${caseId} seat ${seat} (${people[seat]?.name ?? "?"})`);
    }

    // The narration around them, all in the narrator's voice.
    await cue(`c${caseId}-open`, chapter.opening, NARRATOR, `case ${caseId} opening`);
  }

  // Said once, in every case, while the bet is in the ground and the room is still closed.
  await cue(
    "sealed",
    "Your money is on a name nobody else can read, and it stays that way until the case closes. Nobody can watch what you did and copy it, and nobody, including whoever wrote this case, can move the answer now that there is money against it.",
    NARRATOR,
    "the sealed bet",
  );

  console.log(`\n${made} recorded, ${skipped} already there.`);
}

void main();
