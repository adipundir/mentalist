import Link from "next/link";
import { PoweredBy } from "@/components/PoweredBy";

/**
 * The explanation, moved off the front door.
 *
 * All of this is worth saying, it is the actual technical claim the project rests on, but
 * a player arriving at a game should meet a title, not a whitepaper.
 */
export default function About() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-16">
      <Link href="/" className="font-mono text-[10px] tracking-file text-bone-dim hover:text-bone">
        ← MENTALIST
      </Link>

      <h1 className="mt-6 font-type text-[34px] leading-tight text-bone">How it works</h1>

      <p className="mt-5 font-body text-[17px] leading-relaxed text-bone">
        The rooms are public. Every account is in the repository, the deal that decides who
        gives which account is a function anyone can run, and exactly one of those accounts
        is impossible.{" "}
        <span className="text-blood-hot">The puzzle is solvable by anyone who reads
        carefully</span>, and it is supposed to be. Nothing here is trying to hide the answer
        from you.
      </p>
      <p className="mt-3 font-body text-[16px] leading-relaxed text-bone-dim">
        What is encrypted is the name you put money on. It is sealed in your browser, and the
        contract compares it to a sealed answer without either side ever being in the clear:
      </p>

      <figure className="mt-6 border-l-2 border-blood pl-4">
        <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-bone">
          <code>{`euint256 named = encryptedBet.newEuint256(msg.sender);
ebool    right = e.eq(named, _answer[caseId]);  // inside the enclave
e.allow(right, msg.sender);                     // and readable by you alone`}</code>
        </pre>
      </figure>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">
        WHY ENCRYPT AN ANSWER ANYONE CAN WORK OUT
      </h2>
      <p className="mt-2 font-body text-[16px] leading-relaxed text-bone-dim">
        Two reasons, and neither of them is keeping the solution from you. The first is that
        settlement is trustless: the answer is fixed as a ciphertext before a single bet is
        placed, so the house cannot change it afterwards and cannot argue about it either,
        because the contract rules on a covalidator attestation rather than on anybody&rsquo;s
        word. The second is that your bet is private. In a market where you can watch the
        informed money, reading the room stops being the game and following it starts.
      </p>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">
        WHY THIS NEEDS CONFIDENTIAL COMPUTE
      </h2>
      <p className="mt-2 font-body text-[16px] leading-relaxed text-bone-dim">
        A hash commitment would not do it. A person id in a room of eight is brute-forced in
        microseconds, so a commit-reveal either leaks the answer immediately or leaves the
        operator holding it until settlement, which is exactly the trust we are trying to
        remove. The answer has to stay <em>usable</em> while it is secret, because the
        contract has to compare against it. That is what a TEE gives and a hash does not.
      </p>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">HONESTLY</h2>
      <p className="mt-2 font-body text-[16px] leading-relaxed text-bone-dim">
        Inco is <span className="text-bone">TEE-based confidential compute, not FHE, not zk</span>.
        &ldquo;Secret&rdquo; means the value is decrypted inside an Intel TDX enclave, and
        &ldquo;provably fair&rdquo; means a covalidator attestation rather than a
        zero-knowledge proof. Worth stating plainly rather than overselling.
      </p>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">BUILT WITH</h2>
      <ul className="mt-2 space-y-1 font-body text-[15px] text-bone-dim">
        <li>Inco Lightning on Base Sepolia, encrypted state, attested settlement</li>
        <li>Megapot, the losing stakes buy the winners real lottery tickets</li>
        <li>No art or audio assets: every character is drawn SVG, every sound is synthesised</li>
      </ul>

      <p className="mt-10 font-body text-[14px] italic text-bone-dim/70">
        Made for the Inco × Megapot Summer Game Jam, 2026. Adapted from the Red John arc of
        The Mentalist.
      </p>

      <PoweredBy className="mt-12 border-t border-ink-3 pt-8" />

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/"
          className="border border-blood-hot bg-blood-hot/15 px-5 py-2 font-mono text-[10px] tracking-file text-blood-hot hover:bg-blood-hot/25"
        >
          BEGIN
        </Link>
        <a
          href="https://github.com/adipundir/mentalist"
          target="_blank"
          rel="noreferrer"
          className="border border-ink-3 px-5 py-2 font-mono text-[10px] tracking-file text-bone-dim hover:border-bone-dim hover:text-bone"
        >
          SOURCE ↗
        </a>
      </div>
    </main>
  );
}
