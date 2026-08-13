import Link from "next/link";
import { PoweredBy } from "@/components/PoweredBy";

/**
 * How to play, in the order you will actually need it.
 *
 * The old page led with the cryptography, which is the most interesting thing about this
 * project and the least useful thing to read first. A player needs to know what they are
 * looking for and what it costs them to be wrong. The technical claim is at the bottom, for
 * whoever wants it.
 */

const STEPS = [
  {
    n: "01",
    title: "Pick a case",
    body: "A new one opens every day and stays open until its round closes. Each is a room with a body in it, and the people who were there when it happened.",
  },
  {
    n: "02",
    title: "Walk in with nothing",
    body: "No wallet, no signature, no transaction. The room is public data and you can open any case and stand in it without connecting anything at all.",
  },
  {
    n: "03",
    title: "Hear everyone out",
    body: "Click each person. They tell you where they were and what they were doing, as many times as you like, and it costs you nothing to listen.",
  },
  {
    n: "04",
    title: "Find the story that cannot be true",
    body: "Exactly one account in every room is impossible. Not suspicious, not unlikely: impossible. Someone waiting third in a queue with nobody in front of them. Someone asleep for an hour who is also certain nobody came up the stairs.",
  },
  {
    n: "05",
    title: "Put money on him",
    body: "This is the first and only time the chain is involved. Name the man and stake what your read is worth: the name is encrypted in your browser, so nobody watching can see who you backed. Bigger stake, bigger share of the pot if you are right, and once it is down it stays down.",
  },
  {
    n: "06",
    title: "Collect",
    body: "When the case closes you file your result, and the contract rules on it against an attestation from the enclave rather than taking anyone's word. Everyone who named the wrong man leaves their stake behind, and the people who got it right split the whole pot in proportion to what they staked, paid out as real Megapot lottery tickets.",
  },
];

export default function HowToPlay() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-6 pb-32 pt-10">
      <Link href="/" className="font-mono text-[10px] tracking-file text-bone-dim hover:text-bone">
        ← MENTALIST
      </Link>

      <h1 className="mt-6 font-type text-[38px] leading-tight text-bone">How to play</h1>
      <p className="mt-3 font-body text-[17px] leading-relaxed text-bone">
        Red John is standing in every one of these rooms, and he always leaves the same mark:
        a smiling face, drawn in his victim&rsquo;s blood. Everyone in the room gives an
        account of themselves.{" "}
        <span className="text-blood-hot">One of those accounts cannot be true.</span> That man
        is Red John. Your job is to work out which, and to back yourself with money.
      </p>

      <ol className="mt-9 space-y-6">
        {STEPS.map((s) => (
          <li key={s.n} className="grid grid-cols-[auto_1fr] gap-4">
            <span className="font-mono text-[11px] leading-[1.7] tracking-file text-blood-hot">
              {s.n}
            </span>
            <div>
              <h2 className="font-type text-[20px] leading-tight text-bone">{s.title}</h2>
              <p className="mt-1 font-body text-[15px] leading-relaxed text-bone-dim">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 font-mono text-[10px] tracking-file text-bone-dim">
        WORKED EXAMPLE
      </h2>
      <div className="mt-2 border-l-2 border-blood pl-4">
        <p className="font-body text-[15px] leading-relaxed text-bone-dim">
          Five people. Four say they were reading, or on the phone, or out on the step with a
          cigarette. The fifth says he was{" "}
          <span className="text-bone">playing chess, alone, for the whole hour</span>.
        </p>
        <p className="mt-2 font-body text-[15px] leading-relaxed text-bone-dim">
          Nothing about that man looks guilty. He is not sweating and he does not change his
          story. He has simply said a thing that cannot happen, because chess needs someone
          on the other side of the board. That is the whole game.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        <Link
          href="/cases"
          className="border border-blood-hot bg-blood-hot/15 px-5 py-2 font-mono text-[10px] tracking-file text-blood-hot hover:bg-blood-hot/25"
        >
          OPEN THE BOARD
        </Link>
      </div>

      <PoweredBy fixed />
    </main>
  );
}
