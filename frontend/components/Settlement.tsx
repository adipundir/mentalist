"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { MENTALIST_ABI, MENTALIST_ADDRESS, txUrl } from "@/lib/contracts";
import { usdc } from "@/lib/market";
import { countdown } from "@/lib/schedule";

/**
 * The end of a case, and the only place the two stacks meet.
 *
 * **Inco** decides the outcome. Your verdict bit was computed inside the enclave the moment
 * you staked, but it is not readable until the case has closed. The keeper grants access,
 * obtains the covalidator attestation, and files the verdict for the room. The *contract*
 * rules on whether you were right, not this browser. A market that settled on a number the
 * client reported would be a scoreboard.
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

type Busy = "paying" | "cashing" | null;

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


export function Settlement({
  caseId,
  onResolved,
}: {
  caseId: number;
  /** Fires with the verdict the keeper filed, so the page can tell the story. */
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
  /**
   * That this wallet has taken its money, according to this session.
   *
   * `refresh` runs the moment a payout confirms, and the node answers it with the state from
   * before the transaction often enough to matter: `paid` comes back false, the reward
   * buttons stay live under a receipt that says the tickets are already bought, and the next
   * click reverts with `AlreadyPaid`. A receipt is better evidence than a read that can lag,
   * so it is remembered here and the poll is left to catch up.
   */
  const [paidHere, setPaidHere] = useState(false);
  const [now, setNow] = useState(0);
  const [graceMs, setGraceMs] = useState(DEFAULT_GRACE_MS);
  const settlementRequestSent = useRef(false);
  const settlementRequestInFlight = useRef(false);

  useEffect(() => {
    settlementRequestSent.current = false;
    settlementRequestInFlight.current = false;
  }, [caseId]);

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
    if (!pub) return;
    try {
      const c = await pub.readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "cases",
        args: [caseId],
      });
      const [b, share] = address
        ? await Promise.all([
            pub.readContract({ address: MENTALIST_ADDRESS, abi: MENTALIST_ABI, functionName: "bets", args: [caseId, address] }),
            pub.readContract({ address: MENTALIST_ADDRESS, abi: MENTALIST_ABI, functionName: "shareOf", args: [caseId, address] }),
          ])
        : [[0n, false, false, false] as const, 0n];
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

  // Ask the keeper once after close. The request does the whole room, so a response means the
  // page must stop calling it; the normal cron remains the retry path for a failed request.
  useEffect(() => {
    if (!row || row.settled || row.resolved || Date.now() < row.closesAt) return;
    if (settlementRequestSent.current || settlementRequestInFlight.current) return;

    const key = `keeper-nudge:${caseId}`;
    if (sessionStorage.getItem(key)) {
      settlementRequestSent.current = true;
      return;
    }

    settlementRequestInFlight.current = true;
    sessionStorage.setItem(key, String(Date.now()));
    void fetch(`/api/keeper?caseId=${caseId}`, { cache: "no-store" })
      .catch(() => {})
      .finally(() => {
        settlementRequestInFlight.current = false;
        settlementRequestSent.current = true;
        void refresh();
      });
  }, [caseId, row, refresh]);

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
        if (kind === "paying" || kind === "cashing") setPaidHere(true);
        await refresh();
      } catch (e) {
        setError(readable(e));
      } finally {
        setBusy(null);
      }
    },
    [wallet, pub, refresh],
  );

  const closed = row !== null && now >= row.closesAt;
  return (
    <div className="mt-5 border-t border-ink-3 pt-4">
      <h3 className="mb-3 font-mono text-[15px] tracking-file text-bone-dim sm:text-[17px]">
        THE RESULT
      </h3>

      {row === null ? (
        <Waiting>READING THE FILE…</Waiting>
      ) : row.stake === 0n ? (
        <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
          You have no money on this case, so there is nothing to close out.
        </p>
      ) : !closed ? (
        <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
          Your pick is sealed until the case closes.{" "}
          <span className="text-brass">Result in {countdown(row.closesAt - now)}.</span>
        </p>
      ) : /* Filing is only possible until the filing window runs out. The keeper handles the
              filing and settlement, while this page only refreshes the resulting state. */
      !row.resolved && !row.settled && now < row.closesAt + graceMs ? (
        <>
          <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
            Case closed. The keeper is recording the room&rsquo;s results automatically.
          </p>
        </>
      ) : !row.settled ? (
        <>
          <p className="font-body text-[15px] leading-relaxed text-bone">
            {!row.resolved
              ? "The keeper is still finalizing this case. Check back shortly."
              : row.won
                ? "You caught the killer. Your reward unlocks once the rest of the room has been counted."
                : "Wrong man. Your stake goes to whoever got it right."}
          </p>
        </>
      ) : row.paid || paidHere ? (
        <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
          {tookTickets
              ? "Done. Your share bought Megapot tickets for the next drawing, and any change came back as USDC. The counter at the top of the screen is how many tickets you hold. Testnet drawings run every 30 minutes."
              : "Done. Your share is in your wallet as USDC."}
        </p>
      ) : row.winningStake === 0n ? (
        <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
          <span className="text-blood-hot">Oops — you didn&rsquo;t find the killer.</span>{" "}
          He walks.
        </p>
      ) : row.won ? (
        <>
          <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
            <span className="text-brass">Congratulations, you caught the killer.</span> Choose
            your reward.
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
                  }),
                )
              }
              disabled={busy !== null}
            >
              {busy === "paying" ? (
                "BUYING YOUR TICKETS…"
              ) : (
                <span className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/megapot-light.svg" alt="" className="block h-[11px] w-auto" />
                  <span>${usdc((row.share * 105n) / 100n)} IN TICKETS</span>
                </span>
              )}
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
                  }),
                )
              }
              disabled={busy !== null}
            >
              {busy === "cashing" ? (
                "PAYING OUT…"
              ) : (
                <span className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/usdc.svg" alt="" className="block h-[13px] w-auto" />
                  <span>${usdc(row.share)} IN USDC</span>
                </span>
              )}
            </Button>
          </div>
        </>
      ) : (
        <p className="font-body text-[18px] leading-relaxed text-bone sm:text-[21px]">
          The case is closed. No winning claim was recorded.
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
        : "border-bone-dim/55 text-bone hover:border-bone hover:bg-bone/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-2 cursor-pointer border px-5 py-2.5 font-mono text-[12px] tracking-file disabled:cursor-not-allowed disabled:border-ink-3 disabled:text-bone-dim/60 ${style}`}
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
