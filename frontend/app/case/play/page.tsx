"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { CASES } from "@/lib/case";
import { CaseBoard } from "@/components/CaseBoard";
import { chainOracle, getZap } from "@/lib/chain-oracle";
import { MENTALIST_ADDRESS, addressUrl, isDeployed, txUrl } from "@/lib/contracts";

/**
 * The genuine article. Encrypted state on Base Sepolia, answers read back through Inco's
 * attested decryption, and — once a case is closed — surplus Focus convertible to real
 * Megapot tickets.
 */
export default function PlayPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [caseIndex, setCaseIndex] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [txs, setTxs] = useState<{ hash: string; label: string }[]>([]);

  // Pre-warm the SDK so the first attested read of the session isn't the slowest one.
  useEffect(() => {
    void getZap().catch(() => {});
  }, []);

  const oracle = useMemo(() => {
    if (!publicClient || !walletClient || !address) return null;
    return chainOracle({
      publicClient,
      walletClient,
      account: address,
      onTx: (hash, label) => setTxs((t) => [{ hash, label }, ...t].slice(0, 8)),
    });
  }, [publicClient, walletClient, address, nonce]);

  return (
    <main>
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="font-type text-[15px] tracking-wide text-bone-dim hover:text-bone">
            MENTALIST
          </Link>
          <span className="text-bone-dim/30">/</span>
          <span className="font-mono text-[9px] tracking-file text-blood-hot">ON-CHAIN</span>
          <nav className="ml-2 flex flex-wrap gap-1.5">
            {CASES.map((c, i) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setCaseIndex(i);
                  setNonce((n) => n + 1);
                }}
                className={[
                  "cursor-pointer border px-2 py-1 font-mono text-[9px] tracking-file transition-colors",
                  i === caseIndex
                    ? "border-blood-hot text-blood-hot"
                    : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
                ].join(" ")}
              >
                {c.label.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>

      {!isDeployed() ? (
        <Notice title="NOT YET FILED WITH THE REGISTRY">
          No contract address is configured. Deploy the game and set{" "}
          <code className="font-mono text-[11px] text-bone">NEXT_PUBLIC_MENTALIST_ADDRESS</code>.
          <br />
          Until then the{" "}
          <Link href="/case/demo" className="text-blood-hot hover:underline">
            practice file
          </Link>{" "}
          plays the identical game in your browser.
        </Notice>
      ) : !isConnected || !oracle ? (
        <Notice title="THE FILE IS SEALED">
          Connect a wallet on Base Sepolia to open a case. Every question costs one ordinary
          transaction — no Inco fee, because nothing in an interrogation charges one.
          <br />
          <Link href="/case/demo" className="text-blood-hot hover:underline">
            Or play the practice file with no wallet at all ↗
          </Link>
        </Notice>
      ) : (
        <CaseBoard
          key={`${caseIndex}-${nonce}`}
          config={CASES[caseIndex]}
          oracle={oracle}
          seed={0x9a3f + caseIndex * 7919 + nonce}
          onNewCase={() => setNonce((n) => n + 1)}
          chainStatus={
            <div className="crt border border-ink-3 p-3 font-mono text-[10px] leading-relaxed tracking-file">
              <p>
                CASE FILE REGISTRY ·{" "}
                <a
                  href={addressUrl(MENTALIST_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {MENTALIST_ADDRESS.slice(0, 10)}…{MENTALIST_ADDRESS.slice(-6)} ↗
                </a>
              </p>
              {txs.length === 0 ? (
                <p className="opacity-60">AWAITING YOUR FIRST FILING…</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {txs.map((t) => (
                    <li key={t.hash}>
                      <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="underline">
                        {t.hash.slice(0, 12)}…
                      </a>{" "}
                      <span className="opacity-70">{t.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          }
        />
      )}
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-20 sm:px-6">
      <div className="paper border border-ink-3 p-6">
        <h2 className="font-mono text-[10px] tracking-file text-blood-hot">{title}</h2>
        <p className="mt-2 font-body text-[14px] leading-relaxed text-bone-dim">{children}</p>
      </div>
    </div>
  );
}
