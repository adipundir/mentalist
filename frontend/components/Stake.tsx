"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { MENTALIST_ABI, MENTALIST_ADDRESS, ERC20_ABI, MEGAPOT } from "@/lib/contracts";
import { getZap, sealPersonId } from "@/lib/inco";
import { MAX_STAKE, MIN_STAKE, usdc } from "@/lib/market";
import * as sfx from "@/lib/sound";

/**
 * Backing your read, after you have heard the whole room.
 *
 * This is the only place in the game that touches the chain, and it is the only place that
 * needs a wallet. Everything before it, opening the case and hearing every account in it,
 * is public data read out of the casebook, so nobody is asked to connect anything until
 * they have decided who they want to put money on.
 *
 * The name goes out encrypted. The contract compares it to the sealed answer inside Inco's
 * enclave and keeps the resulting bit for you alone, which is what stops a spectator
 * reading the order flow and copying whoever seems to know what they are doing.
 *
 * Once it is down it stays down. There is no withdrawing a live stake, because a bet you
 * can take back after the fact is not a bet.
 */

type Step = "idle" | "sealing" | "approving" | "staking" | "done";

const PRESETS = [500_000n, 1_000_000n, 2_500_000n, 5_000_000n];

/** Parse a typed amount into USDC's six decimals, or null if it is not a usable number. */
function parseUsdc(v: string): bigint | null {
  const t = v.trim();
  if (!/^\d*\.?\d{0,6}$/.test(t) || t === "" || t === ".") return null;
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt(frac.padEnd(6, "0"));
}

export function Stake({
  caseId,
  seat,
  naming,
  pot,
  entrants,
  open,
  onStaked,
  onBusy,
}: {
  caseId: number;
  /** The person id about to be backed. Encrypted before it leaves this machine. */
  seat: number | null;
  /** His name, for the copy. */
  naming: string | null;
  /** Null until the chain has been read. Not zero: a figure the player can act on. */
  pot: bigint | null;
  entrants: number | null;
  /**
   * False while the case is not open on chain, or has stopped taking money. Null while that
   * is still unknown, which is not the same thing and must not be shown as if it were.
   */
  open: boolean | null;
  /** Fires once the stake is down, with what was staked. */
  onStaked: (amount: bigint) => void;
  /**
   * Reports that a stake is in flight, so the room can stop the player changing who they are
   * naming underneath a bet that has already been sealed and sent.
   */
  onBusy?: (busy: boolean) => void;
}) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();

  const [amount, setAmount] = useState<bigint>(1_000_000n);
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  // This panel only exists once the whole room has been heard, which makes it the earliest
  // honest moment to wake the encryption client: the player is deciding, not browsing.
  useEffect(() => {
    void getZap().catch(() => {});
  }, []);

  // The name is sealed at the top of `place` and the transaction carries that ciphertext
  // through two wallet confirmations. Anything the player clicks in the room meanwhile would
  // repaint the copy and the YOUR MAN pip onto a different man while the bet on the wire is
  // still on the first one, and they could never find out which, because it is encrypted.
  useEffect(() => {
    onBusy?.(step === "sealing" || step === "approving" || step === "staking");
  }, [step, onBusy]);

  useEffect(() => {
    if (!pub || !address) return;
    let live = true;
    const read = async () => {
      try {
        const [staked, bal] = await Promise.all([
          pub.readContract({
            address: MENTALIST_ADDRESS,
            abi: MENTALIST_ABI,
            functionName: "hasStaked",
            args: [caseId, address],
          }),
          pub.readContract({
            address: MEGAPOT.usdc,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          }),
        ]);
        if (!live) return;
        setBalance(bal);
        // A wallet that already has money on this case cannot stake again, so the page
        // should be showing them the settlement rather than a stake button.
        if (staked) {
          setStep("done");
          onStaked(0n);
        }
      } catch {
        /* a cold RPC read is not worth a message to the player */
      }
    };
    void read();
    const id = setInterval(read, 12_000);
    return () => {
      live = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub, address, caseId]);

  const place = useCallback(async () => {
    if (!wallet || !pub || !address || seat === null) return;
    setError(null);
    try {
      // Encrypt the name here, on this machine, before anything leaves it. The person id
      // never appears in the calldata, the logs, or on any explorer.
      setStep("sealing");
      const [sealed, fee] = await Promise.all([
        sealPersonId(seat, { account: address, game: MENTALIST_ADDRESS }),
        pub.readContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "quoteFee",
        }),
      ]);

      const allowance = await pub.readContract({
        address: MEGAPOT.usdc,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, MENTALIST_ADDRESS],
      });
      if (allowance < amount) {
        setStep("approving");
        const hash = await wallet.writeContract({
          address: MEGAPOT.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [MENTALIST_ADDRESS, amount],
          account: address,
          chain: wallet.chain,
        });
        // A receipt is not a success. viem resolves this for a reverted transaction too, so
        // without the check an approve that failed falls straight through to the stake, which
        // then reverts on the transfer.
        const ok = await pub.waitForTransactionReceipt({ hash });
        if (ok.status !== "success")
          throw Object.assign(new Error("reverted"), {
            shortMessage: "THE APPROVAL FAILED ON CHAIN",
          });
      }

      setStep("staking");
      sfx.stabAccuse();
      const hash = await wallet.writeContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "stake",
        args: [caseId, sealed, amount],
        value: fee,
        account: address,
        chain: wallet.chain,
      });
      // Likewise here, and this is the one that matters: a revert the UI did not notice is
      // reported to the player as a bet they do not have, on a name they cannot look up
      // afterwards because it was encrypted.
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw Object.assign(new Error("reverted"), {
          shortMessage: "THE CHAIN REJECTED YOUR STAKE",
        });

      setStep("done");
      sfx.stamp();
      onStaked(amount);
    } catch (e) {
      setStep("idle");
      setError(readable(e));
    }
  }, [wallet, pub, address, amount, caseId, seat, onStaked]);

  if (step === "done") return null;

  const busy = step !== "idle";
  const short = balance !== null && balance < amount;
  const outOfRange = amount < MIN_STAKE || amount > MAX_STAKE;

  return (
    // One shape, in every state.
    //
    // This used to be a plain wrap: naming somebody swapped the button's label for the full
    // sentence "NAME DR. LINUS WAGNER, $1.00 ON IT", which no longer fitted, so the button
    // dropped to a second row and the whole bar grew a line taller the moment you picked a
    // man. Every column is fixed-width now and the labels are kept short enough to live
    // inside them, so choosing someone lights the button up rather than rebuilding the bar.
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:flex-nowrap">
      <div className="w-[104px] shrink-0 text-center">
        <p className="font-mono text-[10px] tracking-file text-bone-dim">IN THE POT</p>
        <p className="mt-1.5 font-type text-[22px] leading-none text-brass">
          {pot === null ? "…" : `$${usdc(pot)}`}
        </p>
        <p className="mt-1.5 font-mono text-[9px] tracking-file text-bone-dim">
          {entrants === null
            ? "READING THE CHAIN…"
            : `${entrants} ${entrants === 1 ? "PLAYER" : "PLAYERS"}`}
        </p>
      </div>

      {!address ? (
        <>
          <div className="max-w-[320px]">
            <p className="font-body text-[13px] leading-snug text-bone">
              You have heard them all and it has cost you nothing.{" "}
              <span className="text-blood-hot">Connect a wallet only if you want to back
              your read</span>{" "}
              with money.
            </p>
          </div>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </>
      ) : (
        <>
          <div>
            <p className="font-mono text-[10px] tracking-file text-bone-dim">
              YOUR STAKE{" "}
              {balance !== null && (
                <span className="text-bone-dim/75">· ${usdc(balance)} AVAILABLE</span>
              )}
            </p>
            <div className="mt-1 flex items-center gap-1">
              {PRESETS.map((v) => (
                <button
                  key={v.toString()}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAmount(v);
                    setCustom("");
                  }}
                  className={[
                    "cursor-pointer border px-2.5 py-1 font-mono text-[11px] tracking-file transition-colors disabled:cursor-not-allowed",
                    v === amount && custom === ""
                      ? "border-blood-hot bg-blood-hot/20 text-blood-hot"
                      : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
                  ].join(" ")}
                >
                  ${usdc(v)}
                </button>
              ))}
              <span className="ml-1 font-mono text-[11px] text-bone-dim">$</span>
              <input
                inputMode="decimal"
                placeholder="any"
                value={custom}
                disabled={busy}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (!/^\d*\.?\d{0,6}$/.test(v)) return;
                  setCustom(v);
                  const parsed = parseUsdc(v);
                  if (parsed !== null) setAmount(parsed);
                }}
                className={[
                  "w-[74px] border bg-transparent px-2 py-1 font-mono text-[11px] tracking-file outline-none",
                  custom !== ""
                    ? "border-blood-hot text-blood-hot"
                    : "border-ink-3 text-bone-dim focus:border-bone-dim",
                ].join(" ")}
              />
            </div>
          </div>

          <div className="max-w-[280px]">
            <p className="font-body text-[13px] leading-snug text-bone">
              {naming ? (
                <>
                  You are naming <span className="font-type text-bone">{naming}</span>, and
                  nobody will see it but you.{" "}
                  <span className="text-blood-hot">The more you put down, the bigger your
                  share</span>{" "}
                  of what the wrong answers leave behind.
                </>
              ) : (
                <>
                  <span className="text-blood-hot">Click the man whose story cannot be
                  true</span>
                  , then put your money on it.
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={place}
            disabled={busy || short || outOfRange || !naming || !open}
            className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2.5 font-mono text-[11px] tracking-file text-blood-hot transition-colors hover:bg-blood-hot/25 disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-transparent disabled:text-bone-dim/60"
          >
            {step === "sealing"
              ? "SEALING THE NAME…"
              : step === "approving"
                ? "APPROVING…"
                : step === "staking"
                  ? "PLACING YOUR STAKE…"
                  : // An unread case is not a closed one, and saying so would be inventing a
                    // fact about the contract. The button stays disabled either way, because
                    // `!null` is true: unknown fails closed.
                    open === null
                    ? "READING THE CHAIN…"
                    : !open
                      ? "THIS CASE IS NOT TAKING MONEY"
                      : !naming
                        ? "PICK YOUR MAN"
                        : outOfRange
                          ? `BETWEEN $${usdc(MIN_STAKE)} AND $${usdc(MAX_STAKE)}`
                          : short
                            ? "NOT ENOUGH USDC"
                            : `NAME ${naming.toUpperCase()}, $${usdc(amount)} ON IT`}
          </button>
        </>
      )}

      {error && (
        <p className="w-full text-center font-mono text-[10px] tracking-file text-blood-hot">
          {error}
        </p>
      )}
    </div>
  );
}

function readable(e: unknown): string {
  const m = String((e as { shortMessage?: string })?.shortMessage ?? e);
  if (/AlreadyStaked/.test(m)) return "YOU HAVE ALREADY BACKED THIS ONE";
  if (/NoSuchCase/.test(m)) return "THIS CASE IS NOT OPEN ON CHAIN";
  if (/CaseClosed/.test(m)) return "THIS CASE HAS STOPPED TAKING MONEY";
  if (/StakeOutOfRange/.test(m)) return `BETWEEN $${usdc(MIN_STAKE)} AND $${usdc(MAX_STAKE)}`;
  if (/FeeTooLow/.test(m)) return "THE SEALING FEE WENT UP. TRY AGAIN.";
  if (/User rejected|denied/i.test(m)) return "CANCELLED";
  if (/insufficient funds/i.test(m)) return "NOT ENOUGH ETH FOR GAS";
  return m.slice(0, 120).toUpperCase();
}
