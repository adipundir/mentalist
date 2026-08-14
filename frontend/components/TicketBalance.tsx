"use client";

import { useEffect, useState } from "react";
import { numberToHex } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { MEGAPOT, MEGAPOT_SCAN_FROM } from "@/lib/contracts";

/**
 * How many Megapot tickets this wallet holds.
 *
 * Read from Megapot, not from us. The count used to be a sum of this game's own payout
 * receipts, which was wrong twice over: the receipts live on whichever Mentalist contract
 * bought them, so every redeploy reset a player to zero, and a batch order does not report
 * its ticket ids at call time, so the one field it summed came back empty anyway. Neither
 * had anything to do with what the player owns. The tickets are minted to their address and
 * they stay there, whatever happens to this game afterwards.
 *
 * The jackpot has no balance view — `balanceOf`, `ticketsOf`, `userTicketCount` are all
 * absent, which is why the receipt-counting existed at all — but it emits one log per ticket
 * with the holder indexed, so counting those logs is counting tickets. Verified against a
 * wallet holding 209: 209 logs, all under this topic; against a wallet holding none: zero.
 *
 * A consequence worth knowing: this counts every Megapot ticket the wallet holds from this
 * jackpot, including any bought outside this game. That is the honest reading of the label.
 */
const TICKET_MINTED =
  "0x1171a0297accb0ea82123a0d9bcf24aac48153f56e53e55b55bac3409d37b372" as const;

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
        // `eth_getLogs` straight, rather than viem's `getLogs`: that one wants an ABI it can
        // decode with, and Megapot's event is not in any ABI we hold. The topic hash and the
        // holder are all this needs, and the node does the filtering.
        const logs = (await pub.request({
          method: "eth_getLogs",
          params: [
            {
              address: MEGAPOT.jackpot,
              topics: [TICKET_MINTED, `0x${address.slice(2).toLowerCase().padStart(64, "0")}`],
              fromBlock: numberToHex(MEGAPOT_SCAN_FROM),
              toBlock: "latest",
            },
          ],
        } as never)) as unknown[];
        if (!live) return;
        setTickets(Array.isArray(logs) ? logs.length : 0);
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
