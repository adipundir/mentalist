"use client";

import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isDeployed, MENTALIST_ADDRESS, addressUrl } from "@/lib/contracts";
import * as sfx from "@/lib/sound";

export type PlayMode = "chain" | "practice";

/**
 * How you want to play, asked once, before the story starts.
 *
 * This exists because of one measured number: a move costs ~10s on-chain (2.2s to mine,
 * 8s for the covalidator to decrypt), and a seven-chapter campaign is ~40 moves. That is
 * a real experience for someone who wants the real thing, and an unplayable one for
 * someone who just wants to see the game.
 *
 * Rather than pick for the player, both modes are first-class and the trade is stated
 * plainly. The rules are identical either way — same dealer, same encrypted-lie logic,
 * same Focus economy — so nothing is being hidden from whoever chooses practice.
 */
export function ModePicker({ onPick }: { onPick: (mode: PlayMode) => void }) {
  const { isConnected } = useAccount();
  const deployed = isDeployed();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[92] flex items-center justify-center bg-ink/97 p-5 backdrop-blur"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="w-full max-w-[720px]"
      >
        <p className="text-center font-mono text-[10px] tracking-file text-bone-dim">
          BEFORE YOU START
        </p>
        <h2 className="mt-1 text-center font-type text-[30px] leading-tight text-bone">
          How real do you want this?
        </h2>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {/* ── the real thing ── */}
          <button
            type="button"
            disabled={!deployed || !isConnected}
            onClick={() => {
              sfx.knock();
              onPick("chain");
            }}
            className="paper group flex cursor-pointer flex-col border-2 border-blood-hot p-4 text-left transition-colors hover:bg-blood-hot/10 disabled:cursor-not-allowed disabled:border-ink-3 disabled:opacity-50"
          >
            <span className="font-mono text-[9px] tracking-file text-blood-hot">
              THE CASE FILE · BASE SEPOLIA
            </span>
            <span className="mt-1 font-type text-[20px] text-bone">Play it for real</span>
            <span className="mt-2 font-body text-[13px] leading-snug text-bone-dim">
              Red John&rsquo;s identity is dealt inside an encrypted enclave. Nobody can read
              it — not you, not an observer, <em>not the people who built this</em>. Every
              answer is decrypted for you and nobody else.
            </span>
            <span className="mt-3 border-t border-ink-3 pt-2 font-mono text-[9px] leading-relaxed tracking-file text-bone-dim/70">
              ≈10s PER QUESTION · REAL TRANSACTIONS
              <br />
              SOLVE A CHAPTER → EARN MEGAPOT TICKETS
            </span>
          </button>

          {/* ── practice ── */}
          <button
            type="button"
            onClick={() => {
              sfx.knock(0.85);
              onPick("practice");
            }}
            className="paper group flex cursor-pointer flex-col border-2 border-ink-3 p-4 text-left transition-colors hover:border-bone-dim"
          >
            <span className="font-mono text-[9px] tracking-file text-bone-dim">
              PRACTICE FILE · OFFLINE
            </span>
            <span className="mt-1 font-type text-[20px] text-bone">Play it now</span>
            <span className="mt-2 font-body text-[13px] leading-snug text-bone-dim">
              The identical game, dealt in your browser. Same rules, same dealer, same
              deduction — instant, and no wallet.
            </span>
            <span className="mt-3 border-t border-ink-3 pt-2 font-mono text-[9px] leading-relaxed tracking-file text-bone-dim/70">
              INSTANT · NO WALLET
              <br />
              NO TICKETS — NOTHING IS ON CHAIN
            </span>
          </button>
        </div>

        {/* the wallet gate, in the flow rather than on another page */}
        {deployed && !isConnected && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="font-body text-[13px] italic text-bone-dim">
              Connect a wallet on Base Sepolia to play the real case file.
            </p>
            <ConnectButton showBalance={false} chainStatus="icon" />
          </div>
        )}

        {deployed && (
          <p className="mt-5 text-center font-mono text-[9px] tracking-file text-bone-dim/50">
            CONTRACT ·{" "}
            <a href={addressUrl(MENTALIST_ADDRESS)} target="_blank" rel="noreferrer" className="underline">
              {MENTALIST_ADDRESS.slice(0, 10)}…{MENTALIST_ADDRESS.slice(-6)} ↗
            </a>
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
