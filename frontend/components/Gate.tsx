"use client";

import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isDeployed, MENTALIST_ADDRESS, addressUrl } from "@/lib/contracts";
import { PoweredBy } from "./PoweredBy";

/**
 * The door. Connect a wallet on Base Sepolia, or you don't play.
 *
 * There is no offline mode. Every case is dealt and answered on-chain, which means the
 * game asks for a wallet before it asks for anything else — a real cost, taken deliberately
 * so that nothing on screen is ever a simulation of the thing rather than the thing.
 *
 * The panel deliberately does not black out the room behind it: the lineup is already
 * standing there under the lamp, and letting the player see who they are about to face is
 * a better invitation than a wall.
 */
export function Gate({ onReady }: { onReady: () => void }) {
  const { isConnected } = useAccount();
  const deployed = isDeployed();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[92] flex flex-col items-center justify-center bg-ink/75 p-5 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="w-full max-w-[560px] rounded-sm border-2 border-ink-3 bg-ink/92 px-7 py-8 text-center shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)]"
      >
        <p className="font-type text-[22px] leading-none tracking-wide text-bone-dim">MENTALIST</p>
        <p className="mt-3 font-mono text-[10px] tracking-file text-blood-hot">
          CBI · SERIAL CRIMES
        </p>
        <h2 className="mt-1 font-type text-[32px] leading-tight text-bone">
          Seven cases. One of them is him.
        </h2>
        <p className="mx-auto mt-3 max-w-[44ch] font-body text-[15px] leading-snug text-bone-dim">
          They all belong to the same circle, and they all know which of them is Red John.
          Some will tell you the truth. The rest are protecting him.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          {isConnected ? (
            <button
              type="button"
              onClick={onReady}
              className="cursor-pointer border-2 border-blood-hot bg-blood-hot/15 px-10 py-3 font-type text-[20px] tracking-wide text-blood-hot transition-colors hover:bg-blood-hot/25"
            >
              OPEN THE FIRST CASE
            </button>
          ) : (
            <>
              <ConnectButton showBalance={false} chainStatus="icon" />
              <p className="font-body text-[13px] italic text-bone-dim">
                Base Sepolia. You&rsquo;ll need a little test ETH for gas.
              </p>
            </>
          )}
        </div>

        {deployed && (
          <p className="mt-7 font-mono text-[9px] tracking-file text-bone-dim/50">
            CONTRACT ·{" "}
            <a href={addressUrl(MENTALIST_ADDRESS)} target="_blank" rel="noreferrer" className="underline">
              {MENTALIST_ADDRESS.slice(0, 10)}…{MENTALIST_ADDRESS.slice(-6)} ↗
            </a>
          </p>
        )}

        <PoweredBy className="mt-6 border-t border-ink-3 pt-5" />
      </motion.div>
    </motion.div>
  );
}
