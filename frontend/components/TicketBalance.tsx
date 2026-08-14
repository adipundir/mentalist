"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { MEGAPOT } from "@/lib/contracts";

/**
 * How many Megapot tickets this wallet holds.
 *
 * Read from Megapot's ERC-721 ticket contract, not from Mentalist payout receipts. This is the
 * wallet's actual ticket balance, including tickets bought outside this game.
 */
const TICKET_NFT_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "result", type: "uint256" }],
  },
] as const;

export function TicketBalance() {
  const { address } = useAccount();
  const pub = usePublicClient();
  const [tickets, setTickets] = useState(0);
  // Whether the jackpot has actually answered. Without it the chip renders "0 TICKETS" the
  // moment a wallet connects and corrects itself a second later, which reads as a player
  // being told they hold nothing and then contradicted.
  const [read, setRead] = useState(false);

  useEffect(() => {
    if (!pub || !address) {
      setTickets(0);
      setRead(false);
      return;
    }
    let live = true;
    const read = async () => {
      try {
        const count = await pub.readContract({
          address: MEGAPOT.ticketNft,
          abi: TICKET_NFT_ABI,
          functionName: "balanceOf",
          args: [address],
        });
        if (!live) return;
        setTickets(Number(count));
        setRead(true);
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

  if (!address || !read) return null;

  return (
    <a
      href="https://megapot.io"
      target="_blank"
      rel="noreferrer"
      title="Megapot tickets won in these cases"
      className={`flex h-10 items-center gap-2 border px-3 transition-colors ${
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
