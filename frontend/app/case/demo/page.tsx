"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CASES } from "@/lib/case";
import { localOracle } from "@/lib/oracle";
import { CaseBoard } from "@/components/CaseBoard";

/**
 * The no-wallet door.
 *
 * This is not a mock-up: it runs the same rules, the same dealer distribution, and the same
 * `answer = truth XOR liar[witness]` computation as the contract, over a latency profile
 * sampled from real Base Sepolia + covalidator measurements. A judge plays a genuine case
 * in ninety seconds with no wallet, no faucet and no testnet ETH — and what they learn here
 * transfers exactly to the on-chain mode.
 */
function DemoInner() {
  const params = useSearchParams();
  const caseIndex = Math.min(
    Math.max(Number(params.get("case") ?? 1) || 1, 0),
    CASES.length - 1,
  );

  // The seed is drawn *after* mount, never during render. A random seed picked during
  // render differs between the server pass and the client pass, so React finds a different
  // lineup on hydration, throws away the tree and regenerates it — which is exactly the
  // hydration error this used to produce.
  const [seed, setSeed] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const config = CASES[caseIndex];

  useEffect(() => {
    const fromUrl = Number(params.get("seed"));
    setSeed(Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 1e9));
  }, [params]);

  // A fresh oracle per case — it holds the dealt layout.
  const oracle = useMemo(() => localOracle(), [seed, nonce]);

  if (seed === null) {
    return (
      <>
        <TopBar caseIndex={caseIndex} />
        <p className="mx-auto max-w-[1180px] px-4 py-16 font-mono text-[11px] tracking-file text-bone-dim sm:px-6">
          PULLING THE FILE…
        </p>
      </>
    );
  }

  return (
    <>
      <TopBar caseIndex={caseIndex} />
      <CaseBoard
        key={`${seed}-${nonce}`}
        config={config}
        oracle={oracle}
        seed={seed}
        autoPlay={params.get("auto") === "1"}
        onNewCase={() => {
          setSeed(Math.floor(Math.random() * 1e9));
          setNonce((n) => n + 1);
        }}
        chainStatus={
          <p className="border border-ink-3 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-file text-bone-dim">
            PRACTICE FILE — DEALT IN THIS BROWSER, NOT ON CHAIN.
            <br />
            <span className="text-bone-dim/60">
              Same rules, same dealer, same latency. For encrypted state and real Megapot
              tickets,{" "}
            </span>
            <Link href="/case/play" className="text-blood-hot hover:underline">
              play on-chain ↗
            </Link>
          </p>
        }
      />
    </>
  );
}

function TopBar({ caseIndex }: { caseIndex: number }) {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-2 px-4 pt-5 sm:px-6">
      <Link
        href="/"
        className="font-type text-[15px] tracking-wide text-bone-dim hover:text-bone"
      >
        MENTALIST
      </Link>
      <span className="text-bone-dim/30">/</span>
      <nav className="flex flex-wrap gap-1.5">
        {CASES.map((c, i) => (
          <Link
            key={c.label}
            href={`/case/demo?case=${i}`}
            className={[
              "border px-2 py-1 font-mono text-[9px] tracking-file transition-colors",
              i === caseIndex
                ? "border-blood-hot text-blood-hot"
                : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
            ].join(" ")}
          >
            {c.label.toUpperCase()}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function DemoPage() {
  return (
    <main>
      <Suspense
        fallback={
          <p className="p-8 font-mono text-[11px] tracking-file text-bone-dim">
            PULLING THE FILE…
          </p>
        }
      >
        <DemoInner />
      </Suspense>
    </main>
  );
}
