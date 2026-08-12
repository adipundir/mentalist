"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { ERC20_ABI, MARKET_ABI, MARKET_ADDRESS, MEGAPOT } from "@/lib/contracts";
import { MAX_STAKE, MIN_STAKE, usdc } from "@/lib/market";

/**
 * Backing your read, after you have heard the whole room.
 *
 * The seat was taken blind, before anyone spoke. This is the other half: now that every
 * account is in front of you, decide what your judgement is worth.
 *
 * Everyone who enters puts USDC into one pot. Name the man whose account cannot be true and
 * you are on the winning side; name anyone else and your stake stays. When the round closes
 * the winners split the whole pot in proportion to what each of them put down, paid out as
 * real Megapot tickets bought with the money of everyone who read the room wrong.
 *
 * Once it is down it stays down. There is no withdrawing a live stake, because a bet you can
 * take back after the fact is not a bet.
 */

type Step = "idle" | "approving" | "staking" | "done";

const PRESETS = [500_000n, 1_000_000n, 2_500_000n, 5_000_000n];

/** Parse a typed amount into USDC's six decimals, or null if it is not a usable number. */
function parseUsdc(v: string): bigint | null {
  const t = v.trim();
  if (!/^\d*\.?\d{0,6}$/.test(t) || t === "" || t === ".") return null;
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt(frac.padEnd(6, "0"));
}

export function Stake({
  caseIndex,
  onStaked,
}: {
  caseIndex: number;
  /** Fires once the stake is down, so the room can let the player name someone. */
  onStaked: (amount: bigint) => void;
}) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();

  const [amount, setAmount] = useState<bigint>(1_000_000n);
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pot, setPot] = useState<bigint>(0n);
  const [entrants, setEntrants] = useState(0);
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!pub || !address) return;
    let live = true;
    const read = async () => {
      try {
        const [round, staked, bal] = await Promise.all([
          pub.readContract({
            address: MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: "rounds",
            args: [caseIndex],
          }),
          pub.readContract({
            address: MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: "hasStaked",
            args: [caseIndex, address],
          }),
          pub.readContract({
            address: MEGAPOT.usdc,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          }),
        ]);
        if (!live) return;
        setPot(round[1]);
        setEntrants(Number(round[3]));
        setBalance(bal);
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
  }, [pub, address, caseIndex]);

  const place = useCallback(async () => {
    if (!wallet || !pub || !address) return;
    setError(null);
    try {
      const allowance = await pub.readContract({
        address: MEGAPOT.usdc,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, MARKET_ADDRESS],
      });
      if (allowance < amount) {
        setStep("approving");
        const hash = await wallet.writeContract({
          address: MEGAPOT.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [MARKET_ADDRESS, amount],
        });
        await pub.waitForTransactionReceipt({ hash });
      }

      setStep("staking");
      const hash = await wallet.writeContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "stake",
        args: [caseIndex, amount],
      });
      await pub.waitForTransactionReceipt({ hash });

      setStep("done");
      onStaked(amount);
    } catch (e) {
      setStep("idle");
      setError(readable(e));
    }
  }, [wallet, pub, address, amount, caseIndex, onStaked]);

  if (step === "done") return null;

  const busy = step !== "idle";
  const short = balance !== null && balance < amount;
  const outOfRange = amount < MIN_STAKE || amount > MAX_STAKE;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      <div className="text-center">
        <p className="font-mono text-[10px] tracking-file text-bone-dim">IN THE POT</p>
        <p className="font-type text-[22px] leading-none text-brass">${usdc(pot)}</p>
        <p className="font-mono text-[9px] tracking-file text-bone-dim">
          {entrants} {entrants === 1 ? "PLAYER" : "PLAYERS"}
        </p>
      </div>

      <div>
        <p className="font-mono text-[10px] tracking-file text-bone-dim">
          YOUR STAKE{" "}
          {balance !== null && <span className="text-bone-dim/75">· ${usdc(balance)} AVAILABLE</span>}
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
          Back the man whose story cannot be true.{" "}
          <span className="text-blood-hot">The more you put down, the bigger your share</span>{" "}
          of what the wrong answers leave behind.
        </p>
      </div>

      <button
        type="button"
        onClick={place}
        disabled={busy || short || outOfRange}
        className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2.5 font-mono text-[11px] tracking-file text-blood-hot transition-colors hover:bg-blood-hot/25 disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-transparent disabled:text-bone-dim/60"
      >
        {step === "approving"
          ? "APPROVING…"
          : step === "staking"
            ? "PLACING YOUR STAKE…"
            : outOfRange
              ? `BETWEEN $${usdc(MIN_STAKE)} AND $${usdc(MAX_STAKE)}`
              : short
                ? "NOT ENOUGH USDC"
                : `PUT $${usdc(amount)} ON IT`}
      </button>

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
  if (/RoomNotHeard/.test(m)) return "HEAR EVERYONE OUT FIRST";
  if (/TooLate/.test(m)) return "YOUR CLOCK RAN OUT";
  if (/NoEntry/.test(m)) return "NO SEAT AT THIS CASE";
  if (/RoundClosed/.test(m)) return "THIS CASE HAS CLOSED";
  if (/User rejected|denied/i.test(m)) return "CANCELLED";
  if (/insufficient funds/i.test(m)) return "NOT ENOUGH ETH FOR GAS";
  return m.slice(0, 120).toUpperCase();
}
