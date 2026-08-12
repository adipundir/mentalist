"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { ChainOracle } from "@/lib/chain-oracle";
import { MARKET_ABI, MARKET_ADDRESS, txUrl } from "@/lib/contracts";
import { usdc } from "@/lib/market";

type Step = "settle" | "settling" | "record" | "recording" | "settled" | "claiming" | "done";

/**
 * The end of a case, and the only place the two stacks meet.
 *
 * **Inco** decides the outcome. `accuse` reveals the board and `settle` hands the
 * covalidator's attestation to the game contract, so the *contract* rules on whether you
 * were right rather than this browser. Nothing downstream would mean anything otherwise:
 * a market that settled on a number the client reported would just be a scoreboard.
 *
 * **Megapot** pays it out. Recording your result against the market locks your stake into
 * the winning side of the pot, and when the round closes your share is bought as real
 * lottery tickets with the money of everyone who named the wrong man.
 *
 * Three transactions, deliberately separate: the verdict, the claim on the pot, and the
 * payout. A player should be able to see which is which.
 */
export function Settlement({
  oracle,
  solved,
  caseIndex,
  onBanked,
}: {
  oracle: ChainOracle;
  solved: boolean;
  caseIndex: number;
  /** Fires once the verdict is filed and recorded, so the page can let the player move on. */
  onBanked?: () => void;
}) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();

  const [step, setStep] = useState<Step>("settle");
  const [hashes, setHashes] = useState<{ settle?: string; record?: string; claim?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<bigint>(0n);
  const [sealed, setSealed] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const refresh = useCallback(async () => {
    if (!pub || !address) return;
    try {
      const [round, entry, mine] = await Promise.all([
        pub.readContract({ address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: "rounds", args: [caseIndex] }),
        pub.readContract({ address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: "entries", args: [caseIndex, address] }),
        pub.readContract({ address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: "shareOf", args: [caseIndex, address] }),
      ]);
      setSealed(round[5]);
      setShare(mine);
      setClaimed(entry[5]);
      if (entry[3]) {
        onBanked?.();
        if (step === "record") setStep("settled");
      }
    } catch {
      /* a cold read is not worth a message */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub, address, caseIndex, step]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function fileReport() {
    setStep("settling");
    setError(null);
    try {
      const { hash } = await oracle.settle();
      setHashes((h) => ({ ...h, settle: hash }));
      setStep("record");
    } catch (e) {
      setError(readable(e));
      setStep("settle");
    }
  }

  async function record() {
    if (!wallet || !pub) return;
    setStep("recording");
    setError(null);
    try {
      const hash = await wallet.writeContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "recordResult",
        args: [caseIndex],
      });
      await pub.waitForTransactionReceipt({ hash });
      setHashes((h) => ({ ...h, record: hash }));
      setStep("settled");
      onBanked?.();
      void refresh();
    } catch (e) {
      setError(readable(e));
      setStep("record");
    }
  }

  async function claim() {
    if (!wallet || !pub) return;
    setStep("claiming");
    setError(null);
    try {
      const hash = await wallet.writeContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "claim",
        args: [caseIndex],
      });
      await pub.waitForTransactionReceipt({ hash });
      setHashes((h) => ({ ...h, claim: hash }));
      setStep("done");
    } catch (e) {
      setError(readable(e));
      setStep("settled");
    }
  }

  return (
    <div className="mt-5 border-t border-ink-3 pt-4">
      <h3 className="mb-2 font-mono text-[10px] tracking-file text-bone-dim">
        CLOSING THE CASE ON-CHAIN
      </h3>

      {step === "settle" && (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            The board is revealed, but the contract hasn&rsquo;t ruled yet. File the
            covalidator&rsquo;s attestation and <span className="text-blood-hot">it</span>{" "}
            decides whether you were right, not this browser.
          </p>
          <Button tone="brass" onClick={fileReport}>
            FILE THE REPORT
          </Button>
        </>
      )}

      {step === "settling" && <Waiting>SUBMITTING THE ATTESTATION…</Waiting>}

      {step === "record" && (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            {solved
              ? "Filed, and the contract agrees. Now claim your place on the winning side of the pot."
              : "Filed. Wrong man, so your stake stays in the pot for whoever got it right. Record it and the round can settle."}
          </p>
          <Button tone={solved ? "blood" : "dim"} onClick={record}>
            {solved ? "CLAIM YOUR SHARE OF THE POT" : "RECORD THE RESULT"}
          </Button>
        </>
      )}

      {step === "recording" && <Waiting>RECORDING AGAINST THE POT…</Waiting>}

      {step === "settled" && (
        <>
          {solved && share > 0n ? (
            <p className="font-body text-[13px] leading-relaxed text-bone">
              You&rsquo;re in for{" "}
              <span className="text-brass">${usdc(share)}</span> of the pot, and it grows
              every time someone after you names the wrong man.{" "}
              {sealed
                ? "The round has closed. Take it as tickets."
                : "You can collect it as Megapot tickets once this round closes."}
            </p>
          ) : (
            <p className="font-body text-[13px] leading-relaxed text-bone">
              {solved
                ? "Recorded. Your share is set once the round closes."
                : "Recorded. Your stake belongs to whoever read the room correctly."}
            </p>
          )}
          {solved && sealed && !claimed && share > 0n && (
            <Button tone="blood" onClick={claim}>
              COLLECT ${usdc(share)} IN MEGAPOT TICKETS
            </Button>
          )}
        </>
      )}

      {step === "claiming" && <Waiting>BUYING YOUR TICKETS…</Waiting>}

      {step === "done" && (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          Done. The tickets are in your wallet and in the next drawing. Testnet drawings run
          every 30 minutes.
        </p>
      )}

      {error && (
        <p className="shake mt-2 font-mono text-[10px] tracking-file text-blood-hot">{error}</p>
      )}

      <div className="mt-3 space-y-0.5 font-mono text-[9px] tracking-file text-bone-dim">
        {hashes.settle && <Receipt label="VERDICT FILED" hash={hashes.settle} />}
        {hashes.record && <Receipt label="RECORDED ON THE POT" hash={hashes.record} />}
        {hashes.claim && <Receipt label="TICKETS BOUGHT" hash={hashes.claim} />}
      </div>
    </div>
  );
}

function Receipt({ label, hash }: { label: string; hash: string }) {
  return (
    <p>
      {label} ·{" "}
      <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="underline">
        {hash.slice(0, 12)}… ↗
      </a>
    </p>
  );
}

function Button({
  tone,
  onClick,
  children,
}: {
  tone: "brass" | "blood" | "dim";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const style =
    tone === "blood"
      ? "border-blood-hot bg-blood-hot/15 text-blood-hot hover:bg-blood-hot/25"
      : tone === "brass"
        ? "border-brass text-brass hover:bg-brass/15"
        : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-2 cursor-pointer border px-4 py-2 font-mono text-[10px] tracking-file ${style}`}
    >
      {children}
    </button>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-file text-bone-dim">
      {children}
      <span className="cursor-blink"> ▌</span>
    </p>
  );
}

function readable(e: unknown): string {
  const m = String((e as { shortMessage?: string })?.shortMessage ?? e);
  if (/NoEntry/.test(m)) return "NO STAKE ON THIS CASE";
  if (/AlreadyRecorded/.test(m)) return "ALREADY RECORDED";
  if (/RoundNotSealed/.test(m)) return "THE ROUND HAS NOT CLOSED YET";
  if (/NotAWinner/.test(m)) return "NOTHING TO COLLECT";
  if (/CaseNotClosed/.test(m)) return "FILE THE VERDICT FIRST";
  if (/User rejected|denied/i.test(m)) return "CANCELLED";
  return m.slice(0, 120).toUpperCase();
}
