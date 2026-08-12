import Link from "next/link";

/**
 * The explanation, moved off the front door.
 *
 * All of this is worth saying — it is the actual technical claim the project rests on — but
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
        Every suspect in the room belongs to the same circle, and every one of them knows
        which of them is Red John. You point at a man and ask another whether it was him.
        Some will tell you the truth; the rest are protecting him — and Red John is
        protecting himself, so <span className="text-blood-hot">he always lies</span>.
      </p>
      <p className="mt-3 font-body text-[16px] leading-relaxed text-bone-dim">
        The answer is computed inside an encrypted enclave and passed through that
        witness&rsquo;s hidden honesty bit before it ever reaches you.
      </p>

      <figure className="mt-6 border-l-2 border-blood pl-4">
        <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-bone">
          <code>{`ebool truth  = e.or(...);              // is Red John in this set?
ebool answer = e.xor(truth, liar[w]);  // ...as filtered through w's honesty`}</code>
        </pre>
      </figure>

      <p className="mt-5 font-body text-[16px] leading-relaxed text-bone-dim">
        The whole game is that second line. The chain sees the question; only you see the
        answer. A transparent chain cannot run it, and commit-reveal cannot fake it — proving
        the answer was computed honestly would mean opening the honesty bit, which is the very
        thing the game is about.
      </p>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">
        WHY THIS NEEDS CONFIDENTIAL COMPUTE
      </h2>
      <p className="mt-2 font-body text-[16px] leading-relaxed text-bone-dim">
        Most confidential games hide a <em>value</em> — a card, a board, a role, a bid. This
        hides a <em>transformation</em>: your measurement of one secret is corrupted by a
        second secret you also can&rsquo;t see. Nobody — not the other players, not an
        observer, not the deployer — knows who Red John is until you name him.
      </p>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">HONESTLY</h2>
      <p className="mt-2 font-body text-[16px] leading-relaxed text-bone-dim">
        Inco is <span className="text-bone">TEE-based confidential compute — not FHE, not zk</span>.
        &ldquo;Secret&rdquo; means the value is decrypted inside an Intel TDX enclave;
        &ldquo;provably fair&rdquo; means a covalidator attestation, not a zero-knowledge proof.
        The claim that the deployer cannot know the answer rests on that hardware assumption,
        and we would rather say so than oversell it.
      </p>

      <h2 className="mt-10 font-mono text-[10px] tracking-file text-bone-dim">BUILT WITH</h2>
      <ul className="mt-2 space-y-1 font-body text-[15px] text-bone-dim">
        <li>Inco Lightning on Base Sepolia — encrypted state, attested settlement</li>
        <li>Megapot — the questions you don&rsquo;t spend buy real lottery tickets</li>
        <li>No art or audio assets: every character is drawn SVG, every sound is synthesised</li>
      </ul>

      <p className="mt-10 font-body text-[14px] italic text-bone-dim/70">
        Made for the Inco × Megapot Summer Game Jam, 2026. Adapted from the Red John arc of
        The Mentalist.
      </p>

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
