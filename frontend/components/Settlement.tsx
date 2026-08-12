"use client";

import { useEffect, useState } from "react";
import type { ChainOracle } from "@/lib/chain-oracle";
import { REWARDS_ADDRESS, addressUrl, txUrl } from "@/lib/contracts";

type Step = "settle" | "settling" | "claim" | "claiming" | "done" | "nothing";

/**
 * The end of an on-chain case, and the only place the two stacks meet.
 *
 * **Inco** decided the outcome: `accuse` revealed the board, and `settle` hands the
 * covalidator's attestation to the contract so the *contract*, not this client, rules on
 * whether the accusation was right. That is what makes the streak mean anything.
 *
 * **Megapot** pays it out: whatever Focus you didn't spend converts to real lottery
 * tickets, bought by the reward treasury and gifted straight to your wallet.
 *
 * Two transactions, deliberately separate: the first is the verdict, the second is the
 * reward, and a player should be able to see which is which.
 */
export function Settlement({
  oracle,
  solved,
}: {
  oracle: ChainOracle;
  solved: boolean;
}) {
  const [step, setStep] = useState<Step>("settle");
  const [tickets, setTickets] = useState<number | null>(null);
  const [hashes, setHashes] = useState<{ settle?: string; claim?: string }>({});
  const [error, setError] = useState<string | null>(null);

  // A miss still has to be filed, that is what breaks the streak.
  useEffect(() => {
    if (!solved && step === "claim") setStep("nothing");
  }, [solved, step]);

  async function fileReport() {
    setStep("settling");
    setError(null);
    try {
      const { hash } = await oracle.settle();
      setHashes((h) => ({ ...h, settle: hash }));
      if (!solved) {
        setStep("nothing");
        return;
      }
      const n = await oracle.ticketsEarned();
      setTickets(n);
      setStep(n > 0 ? "claim" : "nothing");
    } catch (e) {
      setError(readable(e));
      setStep("settle");
    }
  }

  async function claim() {
    setStep("claiming");
    setError(null);
    try {
      const hash = await oracle.claimTickets();
      setHashes((h) => ({ ...h, claim: hash }));
      setStep("done");
    } catch (e) {
      setError(readable(e));
      setStep("claim");
    }
  }

  return (
    <div className="mt-5 border-t border-ink-3 pt-4">
      <h3 className="mb-2 font-mono text-[10px] tracking-file text-bone-dim">
        CLOSING THE CASE ON-CHAIN
      </h3>

      {step === "settle" && (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone-dim">
            The board is revealed, but the contract hasn&rsquo;t ruled yet. File the
            covalidator&rsquo;s attestation and{" "}
            <span className="text-bone">it</span> decides whether you were right, not this
            browser.
          </p>
          <button
            type="button"
            onClick={fileReport}
            className="mt-2 cursor-pointer border border-brass px-4 py-2 font-mono text-[10px] tracking-file text-brass hover:bg-brass/15"
          >
            FILE THE REPORT
          </button>
        </>
      )}

      {step === "settling" && <Waiting>SUBMITTING THE ATTESTATION…</Waiting>}

      {step === "claim" && tickets !== null && (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone-dim">
            Filed, and the contract agrees. Your share of the pot comes back as{" "}
            <span className="text-blood-hot">
              {tickets} Megapot ticket{tickets === 1 ? "" : "s"}
            </span>
            , bought for your wallet with the stakes of everyone who read the room wrong.
          </p>
          <button
            type="button"
            onClick={claim}
            className="mt-2 cursor-pointer border border-blood-hot bg-blood-hot/15 px-4 py-2 font-mono text-[10px] tracking-file text-blood-hot hover:bg-blood-hot/25"
          >
            CLAIM {tickets} TICKET{tickets === 1 ? "" : "S"}
          </button>
        </>
      )}

      {step === "claiming" && <Waiting>BUYING YOUR TICKETS…</Waiting>}

      {step === "done" && (
        <p className="font-body text-[13px] leading-relaxed text-bone-dim">
          Done. {tickets} Megapot ticket{tickets === 1 ? "" : "s"} are in your wallet, in the
          next drawing. Testnet drawings run every 30 minutes.
        </p>
      )}

      {step === "nothing" && (
        <p className="font-body text-[13px] leading-relaxed text-bone-dim">
          {solved
            ? "Filed. No Focus left over, so no tickets this time, solve it in fewer reads."
            : "Filed. A miss breaks the streak; the contract recorded it."}
        </p>
      )}

      {error && (
        <p className="shake mt-2 font-mono text-[10px] tracking-file text-blood-hot">{error}</p>
      )}

      <div className="mt-3 space-y-0.5 font-mono text-[9px] tracking-file text-bone-dim/75">
        {hashes.settle && (
          <p>
            VERDICT FILED ·{" "}
            <a href={txUrl(hashes.settle)} target="_blank" rel="noreferrer" className="underline">
              {hashes.settle.slice(0, 14)}… ↗
            </a>
          </p>
        )}
        {hashes.claim && (
          <p>
            TICKETS BOUGHT ·{" "}
            <a href={txUrl(hashes.claim)} target="_blank" rel="noreferrer" className="underline">
              {hashes.claim.slice(0, 14)}… ↗
            </a>
          </p>
        )}
        {REWARDS_ADDRESS && (
          <p>
            TREASURY ·{" "}
            <a href={addressUrl(REWARDS_ADDRESS)} target="_blank" rel="noreferrer" className="underline">
              {REWARDS_ADDRESS.slice(0, 10)}…{REWARDS_ADDRESS.slice(-4)} ↗
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-[10px] tracking-file text-blood-hot">
      <span className="breathe inline-block h-1.5 w-1.5 bg-blood-hot" aria-hidden />
      {children}
    </p>
  );
}

function readable(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/user rejected|denied/i.test(msg)) return "YOU LEFT IT UNFILED.";
  if (/TreasuryEmpty/i.test(msg)) return "THE TREASURY IS OUT OF USDC. NOTHING TO BUY WITH.";
  if (/AlreadyRewarded/i.test(msg)) return "THESE TICKETS WERE ALREADY CLAIMED.";
  if (/CaseNotSolved/i.test(msg)) return "THE CONTRACT HASN'T RULED THIS CASE SOLVED.";
  if (/PurchasesDisabled/i.test(msg)) return "MEGAPOT ISN'T SELLING TICKETS RIGHT NOW.";
  if (/HandleMismatch/i.test(msg)) return "THAT ATTESTATION ISN'T FOR THIS VERDICT.";
  return msg.slice(0, 110).toUpperCase();
}
