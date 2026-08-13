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
 * you staked, but it is not readable until the case has closed: `unseal` is what grants it to
 * you, and that is deliberately a separate transaction. The covalidator answers to the
 * on-chain ACL and knows nothing about closing times, so the grant is the only thing that can
 * carry the timing. Filing then means asking the covalidator to attest the bit and handing
 * those signatures to the contract. The *contract* rules on whether you were right, not this
 * browser. A market that settled on a number the client reported would be a scoreboard.
 *
 * **Megapot** pays it out. Your share of the pot buys real lottery tickets with the money of
 * everyone who named the wrong man, up to the hundred-ticket ceiling in `payout`; the rest of
 * the share comes back as USDC. At the price Base Sepolia quotes, that rest is most of it, so
 * nothing here may tell a winner their whole share is arriving as tickets.
 *
 * Nothing here can happen while the case is still taking money. That is the contract's rule
 * and it is the right one: a player who could read the answer early would simply tell
 * everybody.
 */

type Busy = "resolving" | "settling" | "paying" | "cashing" | "refunding" | null;

interface Row {
  closesAt: number;
  pot: bigint;
  winningStake: bigint;
  settled: boolean;
  entrants: number;
  /** How many of them have a verdict recorded. */
  filed: number;
  stake: bigint;
  resolved: boolean;
  won: boolean;
  paid: boolean;
  share: bigint;
}

/**
 * The contract's filing window, and the earliest anyone may close the books. Read off the
 * chain below rather than assumed: an instance deployed before `FILING_WINDOW` existed runs
 * the old one-hour grace, and offering its winners a settle button three days late would
 * strand them as surely as offering it three days early would only ever revert.
 */
const DEFAULT_GRACE_MS = 60 * 60 * 1000;

/**
 * Gas for `payout`, set by hand instead of estimated.
 *
 * A Megapot ticket costs about a million gas on this chain and the contract buys up to a
 * hundred of them, so a full collection is around ninety million. That is comfortably inside
 * Base's block limit and comfortably outside the ~16.7M ceiling the public RPCs put on
 * `eth_estimateGas`, which refuses anything larger outright. Left to estimate, the button
 * below fails before the wallet ever opens. Unused gas is not charged.
 */
const PAYOUT_GAS = 120_000_000n;

export function Settlement({
  caseId,
  onResolved,
}: {
  caseId: number;
  /** Fires with the verdict the contract accepted, so the page can tell the story. */
  onResolved?: (won: boolean | null) => void;
}) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();

  const [row, setRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<{ label: string; hash: string }[]>([]);
  /** Which form the payout took. Both buttons set the same `paid` flag on chain. */
  const tookTickets = receipts.some((r) => r.label === "TICKETS BOUGHT");
  const [now, setNow] = useState(0);
  const [graceMs, setGraceMs] = useState(DEFAULT_GRACE_MS);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pub) return;
    let live = true;
    void pub
      .readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "FILING_WINDOW",
      })
      .then((w) => {
        if (live) setGraceMs(Number(w) * 1000);
      })
      .catch(() => {
        /* an instance without the constant is one that still runs the hour */
      });
    return () => {
      live = false;
    };
  }, [pub]);

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
        entrants: Number(c[4]),
        filed: Number(c[8]),
        stake: b[0],
        resolved: b[1],
        won: b[2],
        paid: b[3],
        share,
      });
      // Reported either way: only setting it on a filed bet leaves a stale verdict on
      // screen when the account changes under us.
      onResolved?.(b[1] ? b[2] : null);
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

  // Nudge the keeper when somebody opens a case that has closed and not been filed. The
  // schedule that normally does this runs on GitHub, which is late under load, and a player
  // sitting on a finished case is the moment being late actually shows. It asks at most once
  // a minute per browser, and the endpoint is idempotent, so a crowd all asking at once
  // costs one round of work rather than one each.
  useEffect(() => {
    if (!row || row.settled || row.resolved) return;
    if (Date.now() < row.closesAt) return;
    const last = Number(sessionStorage.getItem("keeper-nudge") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("keeper-nudge", String(Date.now()));
    // Nothing here waits on the answer: the poll above picks the result up either way.
    void fetch("/api/keeper").catch(() => {});
  }, [row]);

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
   * Two transactions, and the first is the interesting one. `unseal` grants you your own
   * verdict bit, which the contract holds back until the case has closed: the covalidator
   * decrypts for whoever the on-chain ACL allows and has no notion of a closing time, so a
   * grant made at stake time would have been an answer key on sale for the minimum bet.
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
      try {
        const unsealed = await wallet.writeContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "unseal",
          args: [caseId],
          account: address,
          chain: wallet.chain,
        });
        await pub.waitForTransactionReceipt({ hash: unsealed });
        setReceipts((r) => [...r, { label: "VERDICT UNSEALED", hash: unsealed }]);
      } catch {
        // An instance deployed before `unseal` existed granted the bit at stake time and has
        // no such function to call. The decrypt below then succeeds on that older grant, so
        // this is not fatal on its own: let the covalidator be the one to refuse.
      }

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
  // The window only protects players who have not filed yet. Once the room is complete there
  // is nobody left to protect, so the money releases immediately instead of making the winner
  // sit out a wait that is doing nothing.
  const roomComplete = row !== null && row.entrants > 0 && row.filed >= row.entrants;
  const canSettle =
    row !== null && now >= row.closesAt && (roomComplete || now >= row.closesAt + graceMs);

  return (
    <div className="mt-5 border-t border-ink-3 pt-4">
      <h3 className="mb-2 font-mono text-[10px] tracking-file text-bone-dim">
        THE RESULT
      </h3>

      {row === null ? (
        <Waiting>READING THE FILE…</Waiting>
      ) : row.stake === 0n ? (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          You have no money on this case, so there is nothing to close out.
        </p>
      ) : !closed ? (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          Your money is on a name nobody else can read, and nobody can find out whether it was
          right until the case stops taking bets. That includes us.{" "}
          <span className="text-brass">The result is in {countdown(row.closesAt - now)}.</span>
        </p>
      ) : /* Filing is only possible until the filing window runs out, and the books can only
              be closed after it has. The clock is the guard, NOT the `settled` flag: `_credit`
              reverts on `closesAt + FILING_WINDOW` and settling is a separate permissionless
              call, so between those two moments `settled` is still false and this used to
              offer a button that could only revert. It was not a free misclick either, since
              `unseal` has no upper time bound: it mined, it cost gas, it posted a receipt, and
              then the filing reverted anyway. A late filer falls through to the branch below. */
      !row.resolved && !row.settled && now < row.closesAt + graceMs ? (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            The case has closed and the result is being worked out. The{" "}
            <span className="text-blood-hot">contract</span> decides who was right, not this
            page, so it happens on chain and takes a few minutes. Leave this open and it will
            tell you the moment it knows.
          </p>
          {/* The keeper does this for the whole room on a schedule, so nobody has to press
              anything. The button stays for the case where it is running late, and for anyone
              who would rather not wait on a machine they do not control. */}
          <Button tone="dim" onClick={fileVerdict} disabled={busy !== null}>
            {busy === "resolving" ? "GETTING YOUR RESULT…" : "GET IT NOW"}
          </Button>
        </>
      ) : !row.settled ? (
        <>
          <p className="font-body text-[13px] leading-relaxed text-bone">
            {!row.resolved
              ? "This case closed without a result being recorded for you, so it pays you nothing. The books still need closing before anyone can collect."
              : row.won
                ? "You named him. The contract agrees, and your share is waiting: it is released once everyone else in the room has had their result recorded too."
                : "Wrong man. Your stake stays in the pot for whoever got it right."}
          </p>
          <Button
            tone={row.won ? "blood" : "dim"}
            onClick={() =>
              send("settling", "MONEY RELEASED", () =>
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
              ? "RELEASING…"
              : canSettle
                ? "RELEASE THE MONEY"
                : `WAITING ON ${row.entrants - row.filed} MORE IN THE ROOM`}
          </Button>
        </>
      ) : row.paid ? (
        <p className="font-body text-[13px] leading-relaxed text-bone">
          {/* `refund` and `payout` both set the same paid flag, so this branch has to say
              which one happened or it tells a refunded player they are holding lottery
              tickets. `won` separates them exactly: only a winner can be paid out, and a
              refund only exists in a case nobody won. The tickets are capped at a hundred a
              payout, so on a share of any size the USDC leg is the larger half and calling it
              the change from a whole ticket would be a straight overstatement. */}
          {!row.won
            ? "Done. Your stake is back in your wallet."
            : tookTickets
              ? "Done. Your share is in your wallet: up to a hundred Megapot tickets for the next drawing, and the rest in USDC. Testnet drawings run every 30 minutes."
              : "Done. Your share is in your wallet as USDC."}
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
            {usdc(row.pot)} pot, taken off the people who read the room wrong. Take it as cash,
            or take it in Megapot tickets and the house adds{" "}
            <span className="text-brass">five percent</span> on top: Megapot pays a referral on
            that purchase worth twice the bonus, so the better deal for you is the better deal
            for us. Tickets cap at a hundred a payout and the rest comes back as USDC.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              tone="blood"
              onClick={() =>
                send("paying", "TICKETS BOUGHT", () =>
                  wallet!.writeContract({
                    address: MENTALIST_ADDRESS,
                    abi: MENTALIST_ABI,
                    functionName: "payout",
                    args: [caseId, true],
                    account: address!,
                    chain: wallet!.chain,
                    gas: PAYOUT_GAS,
                  }),
                )
              }
              disabled={busy !== null}
            >
              {busy === "paying"
                ? "BUYING YOUR TICKETS…"
                : `TAKE $${usdc((row.share * 105n) / 100n)} IN TICKETS`}
            </Button>
            <Button
              tone="dim"
              onClick={() =>
                send("cashing", "PAID OUT", () =>
                  wallet!.writeContract({
                    address: MENTALIST_ADDRESS,
                    abi: MENTALIST_ABI,
                    functionName: "payout",
                    args: [caseId, false],
                    account: address!,
                    chain: wallet!.chain,
                    gas: PAYOUT_GAS,
                  }),
                )
              }
              disabled={busy !== null}
            >
              {busy === "cashing" ? "PAYING OUT…" : `TAKE $${usdc(row.share)} IN USDC`}
            </Button>
          </div>
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
