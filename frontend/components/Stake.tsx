"use client";

import { useCallback, useEffect, useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  MARKET_ABI,
  MARKET_ADDRESS,
  MEGAPOT,
  MENTALIST_ABI,
  MENTALIST_ADDRESS,
  ERC20_ABI,
} from "@/lib/contracts";
import { MAX_STAKE, MIN_STAKE, usdc } from "@/lib/market";
import type { Chapter } from "@/lib/story";

/**
 * The wager.
 *
 * Staking is what makes reading the room worth anything. Everyone who enters puts USDC into
 * one pot; everyone who names the wrong man leaves theirs behind. When the round closes, the
 * people who got it right split the whole pot **in proportion to what they staked**, and it
 * comes back as Megapot tickets rather than as cash. Conviction pays twice: once for being
 * right, and once for how much you were willing to put behind it.
 *
 * One entry per wallet per case. You get one read of each room.
 *
 * The order of operations matters and is the reason this component exists rather than a
 * single contract call: the player opens their own case on `Mentalist`, so every answer is
 * granted to them and to nobody else, and only then do they hand the case id to the market.
 * The market never touches an encrypted handle.
 */

type Step = "idle" | "approving" | "opening" | "entering" | "done";

const STAKES = [500_000n, 1_000_000n, 2_500_000n, 5_000_000n];

export function Stake({
  caseIndex,
  chapter,
  onEntered,
}: {
  caseIndex: number;
  chapter: Chapter;
  /** Fires with the case id and the contract's own deadline once the stake is down. */
  onEntered: (caseId: bigint, deadline?: bigint) => void;
}) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();

  const [stake, setStake] = useState<bigint>(1_000_000n);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pot, setPot] = useState<bigint>(0n);
  const [entrants, setEntrants] = useState(0);
  const [balance, setBalance] = useState<bigint | null>(null);
  /** This wallet has already used its entry on a case that can no longer be played. */
  const [resumeBlocked, setResumeBlocked] = useState(false);
  /** A case already paid for whose stake did not land. Reused so a retry is not billed twice. */
  const [orphan, setOrphan] = useState<bigint | null>(null);

  // What the pot is worth right now, and whether this wallet has already had its go.
  useEffect(() => {
    if (!pub || !address) return;
    let live = true;
    const read = async () => {
      try {
        const [round, entry, bal] = await Promise.all([
          pub.readContract({
            address: MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: "rounds",
            args: [caseIndex],
          }),
          pub.readContract({
            address: MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: "entries",
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
        // Only resume a case that is still open and genuinely untouched. Rejoining one
        // that has questions already spent, or that was accused before a reload, hands the
        // player a room where nothing they do can work.
        if (entry[0] > 0n) {
          const c = await pub.readContract({
            address: MENTALIST_ADDRESS,
            abi: MENTALIST_ABI,
            functionName: "getCase",
            args: [entry[1]],
          });
          if (!live) return;
          if (c.status === 1 && c.questionsAsked === 0) {
            setStep("done");
            onEntered(entry[1], entry[2]);
          } else {
            setResumeBlocked(true);
          }
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

  const enter = useCallback(async () => {
    if (!wallet || !pub || !address) return;
    setError(null);
    try {
      // 1. Let the market pull exactly this stake, and no more.
      const allowance = await pub.readContract({
        address: MEGAPOT.usdc,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, MARKET_ADDRESS],
      });
      if (allowance < stake) {
        setStep("approving");
        const hash = await wallet.writeContract({
          address: MEGAPOT.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [MARKET_ADDRESS, stake],
        });
        await pub.waitForTransactionReceipt({ hash });
      }

      // 2. Open the case yourself, so the answers are yours alone. If a previous attempt
      //    already paid for one and only the stake failed, finish that case rather than
      //    buying a second.
      setStep("opening");
      if (orphan !== null) {
        setStep("entering");
        const retry = await wallet.writeContract({
          address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: "enter",
          args: [caseIndex, orphan, stake],
        });
        await pub.waitForTransactionReceipt({ hash: retry });
        setOrphan(null);
        setStep("done");
        onEntered(orphan);
        return;
      }
      const fee = await pub.readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "quoteOpenFee",
        args: [chapter.suspects],
      });
      const openHash = await wallet.writeContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "openCase",
        args: [chapter.suspects, chapter.liars, chapter.focus, chapter.turnAt],
        value: fee as bigint,
      });
      const receipt = await pub.waitForTransactionReceipt({ hash: openHash });

      // Decode CaseOpened rather than trusting log order: dealing a case also emits Inco's
      // own events from this address, and picking the first one is a coin flip.
      const opened = parseEventLogs({
        abi: MENTALIST_ABI,
        eventName: "CaseOpened",
        logs: receipt.logs,
      });
      const caseId = opened[0]?.args?.caseId;
      if (caseId === undefined) throw new Error("could not read the case id");

      // 3. Put the stake down against it.
      setStep("entering");
      setOrphan(caseId);
      const enterHash = await wallet.writeContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "enter",
        args: [caseIndex, caseId, stake],
      });
      await pub.waitForTransactionReceipt({ hash: enterHash });

      setOrphan(null);
      setStep("done");
      onEntered(caseId);
    } catch (e) {
      setStep("idle");
      setError(readable(e));
    }
  }, [wallet, pub, address, stake, chapter, caseIndex, onEntered, orphan]);

  if (step === "done") return null;

  if (resumeBlocked) {
    return (
      <p className="text-center font-body text-[15px] text-bone">
        You have already had your go at this room.{" "}
        <a href="/cases" className="text-blood-hot underline">
          Pick another case.
        </a>
      </p>
    );
  }

  const busy = step !== "idle";
  const short = balance !== null && balance < stake;

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
        <p className="font-mono text-[10px] tracking-file text-bone-dim">YOUR STAKE</p>
        <div className="mt-1 flex gap-1">
          {STAKES.map((v) => (
            <button
              key={v.toString()}
              type="button"
              disabled={busy}
              onClick={() => setStake(v)}
              className={[
                "cursor-pointer border px-2.5 py-1 font-mono text-[11px] tracking-file transition-colors disabled:cursor-not-allowed",
                v === stake
                  ? "border-blood-hot bg-blood-hot/20 text-blood-hot"
                  : "border-ink-3 text-bone-dim hover:border-bone-dim hover:text-bone",
              ].join(" ")}
            >
              ${usdc(v)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[300px]">
        <p className="font-body text-[13px] leading-snug text-bone">
          Name him and you take a share of the pot,{" "}
          <span className="text-blood-hot">bigger the more you staked</span>. Name the wrong
          man and your stake pays whoever got it right.
        </p>
      </div>

      <button
        type="button"
        onClick={enter}
        disabled={busy || short}
        className="cursor-pointer border border-blood-hot bg-blood-hot/15 px-5 py-2.5 font-mono text-[11px] tracking-file text-blood-hot transition-colors hover:bg-blood-hot/25 disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-transparent disabled:text-bone-dim/60"
      >
        {step === "approving"
          ? "APPROVING…"
          : step === "opening"
            ? "DEALING THE CASE…"
            : step === "entering"
              ? "PLACING YOUR STAKE…"
              : short
                ? "NOT ENOUGH USDC"
                : `STAKE $${usdc(stake)} AND OPEN THE CASE`}
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
  if (/AlreadyEntered/.test(m)) return "THIS WALLET HAS ALREADY PLAYED THIS CASE";
  if (/RoundClosed/.test(m)) return "THIS CASE HAS CLOSED";
  if (/StakeOutOfRange/.test(m))
    return `STAKE MUST BE BETWEEN $${usdc(MIN_STAKE)} AND $${usdc(MAX_STAKE)}`;
  if (/User rejected|denied/i.test(m)) return "CANCELLED";
  if (/insufficient funds/i.test(m)) return "NOT ENOUGH ETH FOR GAS";
  return m.slice(0, 120).toUpperCase();
}
