"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { DEPLOY_BLOCK, MENTALIST_ADDRESS } from "@/lib/contracts";

/**
 * How many Megapot tickets this wallet has won here.
 *
 * Counted from this contract's own `PaidOut` logs rather than asked of Megapot, because the
 * jackpot contract has no balance view for a ticket holder: tickets are minted to an address
 * and the only per-holder record anywhere is the ids in the purchase receipt. Ours carries
 * them, so the sum of `ticketIds` across a player's payouts is exactly what they hold from
 * this game.
 *
 * Shown from the moment a wallet is connected, zero included. Hiding it until the count was
 * positive meant a player who had not collected yet could not tell the counter existed, which
 * reads as a missing feature rather than an empty one.
 *
 * Counts only what was won on the live contract, since the scan starts at its deployment
 * block. A redeploy therefore starts everyone at zero, which is correct: the old contract's
 * tickets are still in the old contract's payouts.
 */
const PAID_OUT = parseAbiItem(
  "event PaidOut(uint16 indexed caseId, address indexed player, uint256 share, uint256[] ticketIds)",
);

export function TicketBalance() {
  const { address } = useAccount();
  const pub = usePublicClient();
  const [tickets, setTickets] = useState(0);

  useEffect(() => {
    if (!pub || !address) {
      setTickets(0);
      return;
    }
    let live = true;
    const read = async () => {
      try {
        const logs = await pub.getLogs({
          address: MENTALIST_ADDRESS,
          event: PAID_OUT,
          args: { player: address },
          fromBlock: DEPLOY_BLOCK,
          toBlock: "latest",
        });
        const n = logs.reduce((sum, l) => sum + ((l.args.ticketIds as bigint[] | undefined)?.length ?? 0), 0);
        if (live) setTickets(n);
      } catch {
        /* a cold read leaves the count where it was rather than blanking it */
      }
    };
    void read();
    const id = setInterval(read, 20_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pub, address]);

  if (!address) return null;

  return (
    <a
      href="https://megapot.io"
      target="_blank"
      rel="noreferrer"
      title="Megapot tickets won in these cases"
      className={`flex items-center gap-1.5 border px-2.5 py-1.5 transition-colors ${
        tickets > 0
          ? "border-brass/40 bg-brass/10 hover:border-brass/70"
          : "border-ink-3 bg-ink hover:border-bone-dim/40"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/megapot-light.svg" alt="Megapot" className="block h-[10px] w-auto shrink-0" />
      <span className={`font-mono text-[10px] leading-none tracking-file ${tickets > 0 ? "text-brass" : "text-bone-dim"}`}>
        {tickets} {tickets === 1 ? "TICKET" : "TICKETS"}
      </span>
    </a>
  );
}
