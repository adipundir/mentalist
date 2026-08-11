import Link from "next/link";
import { CASES } from "@/lib/case";
import { CHAPTERS } from "@/lib/story";

/**
 * Three doors, in order of how much they ask of the visitor. A judge with ninety seconds
 * and no wallet must be able to play a complete case, so "SOLVE ONE" comes before
 * "PLAY ON-CHAIN" and needs nothing but a click.
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-6 py-16 sm:py-24">
      <p className="font-mono text-[10px] tracking-file text-bone-dim">
        CONFIDENTIAL · BASE SEPOLIA · INCO LIGHTNING
      </p>

      <h1 className="mt-3 font-type text-[48px] leading-[0.95] text-bone sm:text-[72px]">
        MENTALIST
      </h1>

      <p className="mt-4 max-w-[54ch] font-body text-[18px] leading-relaxed text-bone">
        Nine suspects. One of them is Red John. Some of them lie —{" "}
        <span className="text-blood-hot">and Red John always does</span>.
      </p>

      <p className="mt-4 max-w-[62ch] font-body text-[15px] leading-relaxed text-bone-dim">
        You interrogate witnesses with yes/no questions about who&rsquo;s in the room. Every
        answer is computed inside an encrypted enclave and passed through that
        witness&rsquo;s hidden honesty bit before it reaches you. The chain sees the question.
        Only you see the answer. Nobody — not the other players, not the deployer, not an
        observer — knows who Red John is until you name him.
      </p>

      <figure className="mt-8 border-l-2 border-blood pl-4">
        <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-bone">
          <code>{`ebool truth  = e.or(...);              // is Red John in this set?
ebool answer = e.xor(truth, liar[w]);  // ...as filtered through w's honesty`}</code>
        </pre>
        <figcaption className="mt-2 font-body text-[13px] italic text-bone-dim">
          The whole game is that second line. A transparent chain cannot run it, and
          commit-reveal cannot fake it — proving the answer was computed honestly would mean
          opening the honesty bit, which is the very thing the game is about.
        </figcaption>
      </figure>

      {/* ── the three doors ── */}
      <nav className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Door
          href="/story"
          kicker="THE CAMPAIGN"
          title="Work the list"
          primary
          note="Seven chapters, narrated. 2,164 names down to one."
        />
        <Door
          href="/case/demo?auto=1"
          kicker="ZERO CLICKS"
          title="Watch a case"
          note="A full interrogation, played out. Fifteen seconds."
        />
        <Door
          href="/case/demo"
          kicker="NO WALLET"
          title="Solve one"
          note="A one-off case, dealt in your browser. Nothing to install."
        />
        <Door
          href="/case/play"
          kicker="BASE SEPOLIA"
          title="Play on-chain"
          note="The genuine article: encrypted state, attested answers, Megapot tickets."
        />
      </nav>

      {/* ── the campaign ── */}
      <section className="mt-14">
        <h2 className="border-b border-ink-3 pb-2 font-mono text-[10px] tracking-file text-bone-dim">
          THE LIST — SEVEN CHAPTERS
        </h2>
        <ol className="mt-3 divide-y divide-ink-3">
          {CHAPTERS.map((c) => (
            <li key={c.title} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="font-mono text-[10px] text-bone-dim/50">{c.label}</span>{" "}
                <span className="font-type text-[14px] text-bone">{c.title}</span>
                <span className="block font-body text-[12px] italic text-bone-dim">{c.blurb}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-file text-bone-dim">
                {c.n} SUSPECTS
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── free play ── */}
      <section className="mt-12">
        <h2 className="border-b border-ink-3 pb-2 font-mono text-[10px] tracking-file text-bone-dim">
          FREE PLAY
        </h2>
        <ol className="mt-3 divide-y divide-ink-3">
          {CASES.map((c, i) => (
            <li key={c.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="font-mono text-[10px] text-bone-dim/50">
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                <span className="font-type text-[14px] text-bone">{c.label}</span>
                <span className="block font-body text-[12px] italic text-bone-dim">{c.blurb}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-file text-bone-dim">
                {c.suspects}·{c.liars}·{c.focus}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-14 border-t border-ink-3 pt-5 font-body text-[12px] leading-relaxed text-bone-dim/80">
        <p>
          Built for the Inco × Megapot Summer Game Jam. Inco is{" "}
          <span className="text-bone-dim">TEE-based confidential compute — not FHE, not zk</span>.
          &ldquo;Secret&rdquo; means the value is decrypted inside an Intel TDX enclave;
          &ldquo;provably fair&rdquo; means a covalidator attestation, not a zero-knowledge
          proof. The claim that the deployer cannot know who Red John is rests on that
          hardware assumption, and we would rather say so than oversell it.
        </p>
      </footer>
    </main>
  );
}

function Door({
  href,
  kicker,
  title,
  note,
  primary,
}: {
  href: string;
  kicker: string;
  title: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "paper group flex cursor-pointer flex-col gap-1 border p-4 transition-colors",
        primary
          ? "border-blood-hot hover:bg-blood-hot/10"
          : "border-ink-3 hover:border-bone-dim",
      ].join(" ")}
    >
      <span
        className={`font-mono text-[9px] tracking-file ${primary ? "text-blood-hot" : "text-bone-dim/60"}`}
      >
        {kicker}
      </span>
      <span className="font-type text-[19px] leading-tight text-bone">{title}</span>
      <span className="font-body text-[12px] leading-snug text-bone-dim">{note}</span>
    </Link>
  );
}
