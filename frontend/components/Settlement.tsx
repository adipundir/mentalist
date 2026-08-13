"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { MENTALIST_ABI, MENTALIST_ADDRESS, txUrl } from "@/lib/contracts";
import { attestVerdict } from "@/lib/inco";
import { usdc } from "@/lib/market";
import { countdown } from "@/lib/schedule";
import * as sfx from "@/lib/sound";

/**
 * The end of a case, and the only place the two stacks meet.
 *
 * **Inco** decides the outcome. Your verdict bit was computed inside the enclave the moment
 * you staked and granted to you alone; filing it means asking the covalidator to attest it
 * and handing those signatures to the contract. The *contract* rules on whether you were
 * right, not this browser. A market that settled on a number the client reported would be a
 * scoreboard.
 *
 * **Megapot** pays it out. Your share of the pot is bought as real lottery tickets with the
 * money of everyone who named the wrong man.
 *
 * Nothing here can happen while the case is still taking money. That is the contract's rule
 * and it is the right one: a player who could read the answer early would simply tell
 * everybody.
 */

type Busy = "resolving" | "settling" | "paying" | "refunding" | null;

interface Row {
  closesAt: number;
  pot: bigint;
  winningStake: bigint;
  settled: boolean;
  stake: bigint;
  resolved: boolean;
  won: boolean;
  paid: boolean;
  share: bigint;
}

/** The contract's grace window after close, so a slow filer is not cut out of their win. */
const GRACE_MS = 60 * 60 * 1000;

export function Settlement({
  caseId,
  onResolved,
}: {
  caseId: number;
  /** Fires with the verdict the contract accepted, so the page can tell the story. */
  onResolved?: (won: boolean) => void;
}) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();

  const [row, setRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<{ label: string; hash: string }[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!pub || !address) return;
    try {
      const [c, b, share] = await Promise.all([
        pub.readContract({ address: MENTALIST_ADDRESS, abi: MENTALIST_ABI, functionName: "cases", args: [caseId] }),
        pub.readContract({ address: MENTALIST_ADDRESS, abi: MENTALIST_ABI, functionName: "bets", args: [caseId, address] }),
        pub.readContract({ address: MENTALIST_ADDRESS, abi: MENTALIST_ABI, functionName: "shareOf", args: [caseId, address] }),
      ]);
      setRow({
        closesAt: Number(c[0]) * 1000,
        pot: c[2],
        winningStake: c[3],
        settled: c[6],
        stake: b[0],
        resolved: b[1],
        won: b[2],
        paid: b[3],
        share,
      });
      if (b[1]) onResolved?.(b[2]);
    } catch {
      /* a cold read is not worth a message */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub, address, caseId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  /** One transaction per action, and each one waits for its receipt before the UI moves. */
  const send = useCallback(
    async (kind: Exclude<Busy, null>, label: string, run: () => Promise<`0x${string}`>) => {
      if (!wallet || !pub) return;
      setBusy(kind);
      setError(null);
      try {
        const hash = await run();
        // viem resolves a receipt for a reverted transaction as happily as for a mined one,
        // so without this a failed settle or payout files a receipt row claiming it worked.
        const receipt = await pub.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw Object.assign(new Error("reverted"), { shortMessage: "THE CHAIN REJECTED IT" });
        setReceipts((r) => [...r, { label, hash }]);
        await refresh();
      } catch (e) {
        setError(readable(e));
      } finally {
        setBusy(null);
      }
    },
    [wallet, pub, refresh],
  );

  /**
   * File the one bit that decides your case.
   *
   * The handle is the contract's own record of your verdict, so there is nothing to invent
   * and nothing to argue about: the covalidator signs the value, the contract checks the
   * handle it stored and the signatures, and rules.
   */
  async function fileVerdict() {
    if (!wallet || !pub || !address) return;
    setBusy("resolving");
    setError(null);
    try {
      const handle = await pub.readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "verdictHandle",
        args: [caseId, address],
      });
      const { won, attestation, signatures } = await attestVerdict(wallet, handle);
      const hash = await wallet.writeContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "resolve",
        args: [caseId, attestation, signatures],
        account: address,
        chain: wallet.chain,
      });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw Object.assign(new Error("reverted"), { shortMessage: "THE CHAIN REFUSED THE FILING" });
      setReceipts((r) => [...r, { label: "VERDICT FILED", hash }]);
      sfx.stamp();
      if (won) sfx.stingSolved();
      else sfx.stingMissed();
      await refresh();
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(null);
    }
  }

  const closed = row !== null && now >= row.closesAt;
  const canSettle = row !== null && now >= row.closesAt + GRACE_MS;

  return (
    <div className="mt-5 border-t border-ink-3 pt-4">
      <h3 className="mb-2 font-mono text-[10px] tracking-file text-bone-dim">
        CLOSING THE CASE ON-CHAIN
      </h3>

      {row === null ? (
        <Waiting>READING THE FILE…</Waiting>
      ) : row.stake === 0n ? (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          You have no money on this case, so there is nothing to close out.
        </p>
      ) : !closed ? (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          Your stake is in and the case is still taking money. Nobody, including you, can
          read the answer while that is true.{" "}
          <span className="text-brass">Come back in {countdown(row.closesAt - now)}</span> and
          file your verdict.
        </p>
      ) : /* Filing is only possible until somebody closes the books, which anyone may do an
              hour after the case closes. Offering the button past that point would hand the
              player a transaction that can only revert `AlreadySettled`, so a late filer falls
              through instead: to the refund below if the case had no winners, and otherwise to
              the line that tells them the truth, which is that it is over. */
      !row.resolved && !row.settled ? (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            The case has closed. Ask the covalidator to attest the one bit that says whether
            you named him, and hand it to the contract:{" "}
            <span className="text-blood-hot">it</span> decides, not this browser.
          </p>
          <Button tone="brass" onClick={fileVerdict} disabled={busy !== null}>
            {busy === "resolving" ? "FILING YOUR VERDICT…" : "FILE YOUR VERDICT"}
          </Button>
        </>
      ) : !row.settled ? (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            {row.won
              ? "Filed, and the contract agrees: you named him. The books close once everyone has had their hour to file."
              : "Filed. Wrong man, so your stake stays in the pot for whoever got it right."}
          </p>
          <Button
            tone={row.won ? "blood" : "dim"}
            onClick={() =>
              send("settling", "BOOKS CLOSED", () =>
                wallet!.writeContract({
                  address: MENTALIST_ADDRESS,
                  abi: MENTALIST_ABI,
                  functionName: "settle",
                  args: [caseId],
                  account: address!,
                  chain: wallet!.chain,
                }),
              )
            }
            disabled={busy !== null || !canSettle}
          >
            {busy === "settling"
              ? "CLOSING THE BOOKS…"
              : canSettle
                ? "CLOSE THE BOOKS"
                : `BOOKS CLOSE IN ${countdown(row.closesAt + GRACE_MS - now)}`}
          </Button>
        </>
      ) : row.paid ? (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          {/* `refund` and `payout` both set the same paid flag, so this branch has to say
              which one happened or it tells a refunded player they are holding lottery
              tickets. `won` separates them exactly: only a winner can be paid out, and a
              refund only exists in a case nobody won. It also stops the copy promising
              tickets to a winner whose share was too small to buy a whole one. */}
          {row.won
            ? "Done. Your share is in your wallet: Megapot tickets for the next drawing, and USDC for whatever a whole ticket would not buy. Testnet drawings run every 30 minutes."
            : "Done. Your stake is back in your wallet."}
        </p>
      ) : row.winningStake === 0n ? (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            Nobody in this room named him. There is no winning side to divide the pot among,
            so every stake goes back where it came from.
          </p>
          <Button
            tone="brass"
            onClick={() =>
              send("refunding", "STAKE RETURNED", () =>
                wallet!.writeContract({
                  address: MENTALIST_ADDRESS,
                  abi: MENTALIST_ABI,
                  functionName: "refund",
                  args: [caseId],
                  account: address!,
                  chain: wallet!.chain,
                }),
              )
            }
            disabled={busy !== null}
          >
            {busy === "refunding" ? "RETURNING YOUR STAKE…" : `TAKE BACK $${usdc(row.stake)}`}
          </Button>
        </>
      ) : row.won ? (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            You&rsquo;re in for <span className="text-brass">${usdc(row.share)}</span> of a $
            {usdc(row.pot)} pot. Collect it as real Megapot tickets, bought with the money of
            everyone who read the room wrong.
          </p>
          <Button
            tone="blood"
            onClick={() =>
              send("paying", "TICKETS BOUGHT", () =>
                wallet!.writeContract({
                  address: MENTALIST_ADDRESS,
                  abi: MENTALIST_ABI,
                  functionName: "payout",
                  args: [caseId],
                  account: address!,
                  chain: wallet!.chain,
                }),
              )
            }
            disabled={busy !== null}
          >
            {busy === "paying"
              ? "BUYING YOUR TICKETS…"
              : `COLLECT $${usdc(row.share)} IN MEGAPOT TICKETS`}
          </Button>
        </>
      ) : (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          The books are closed. Your stake belongs to whoever read the room correctly.
        </p>
      )}

      {error && (
        <p className="shake mt-2 font-mono text-[10px] tracking-file text-blood-hot">{error}</p>
      )}

      <div className="mt-3 space-y-0.5 font-mono text-[9px] tracking-file text-bone-dim">
        {receipts.map((r) => (
          <Receipt key={r.hash} label={r.label} hash={r.hash} />
        ))}
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
  disabled,
  children,
}: {
  tone: "brass" | "blood" | "dim";
  onClick: () => void;
  disabled?: boolean;
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
      disabled={disabled}
      className={`mt-2 cursor-pointer border px-4 py-2 font-mono text-[10px] tracking-file disabled:cursor-not-allowed disabled:border-ink-3 disabled:text-bone-dim/60 ${style}`}
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
  if (/NothingStaked/.test(m)) return "NO STAKE ON THIS CASE";
  if (/AlreadyResolved/.test(m)) return "ALREADY FILED";
  if (/AlreadySettled/.test(m)) return "THE BOOKS CLOSED BEFORE YOU FILED";
  if (/CaseStillOpen/.test(m)) return "THE CASE HAS NOT CLOSED YET";
  if (/NotSettled/.test(m)) return "THE BOOKS ARE NOT CLOSED YET";
  if (/AlreadyPaid/.test(m)) return "ALREADY COLLECTED";
  if (/DidNotWin/.test(m)) return "NOTHING TO COLLECT";
  if (/HandleMismatch|InvalidAttestation/.test(m)) return "THE COVALIDATOR'S SIGNATURE WAS REFUSED";
  if (/User rejected|denied/i.test(m)) return "CANCELLED";
  return m.slice(0, 120).toUpperCase();
}
