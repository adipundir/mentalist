"use client";

/**
 * The on-chain oracle: the same `Oracle` interface the demo implements, backed by real
 * encrypted state.
 *
 * The two Inco read paths are used exactly where they belong:
 *
 *   - **Loop B, private decrypt** for testimony. `interrogate` grants the answer to the
 *     detective with `e.allow`, so it is read with `attestedDecrypt` — which needs the
 *     wallet to sign, because the handle is private. Nobody else can read it, not even by
 *     watching the chain.
 *   - **Loop A, public reveal** for the verdict. `accuse` calls `e.reveal` on the whole
 *     board, so `attestedReveal` needs no signature at all and the post-mortem paints for
 *     free.
 */

import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { decodeEventLog } from "viem";
import { Lightning } from "@inco/lightning-js/lite";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "./contracts";
import type { CaseConfig, Phase } from "./case";
import type { AskResult, DealtCase, Oracle } from "./oracle";

/** Shared retry policy: quick first attempt, patient tail. One config, imported everywhere. */
export const BACKOFF = { maxRetries: 12, baseDelayInMs: 350, backoffFactor: 1.4 } as const;

type Zap = Awaited<ReturnType<typeof Lightning.baseSepoliaTestnet>>;

let zapPromise: Promise<Zap> | null = null;

/**
 * Cold-init costs hundreds of milliseconds, so warm it on mount rather than on the first
 * question — otherwise the very first reveal in a session is the slowest one.
 */
export function getZap(): Promise<Zap> {
  if (!zapPromise) zapPromise = Lightning.baseSepoliaTestnet();
  return zapPromise;
}

/** The SDK returns a scheme-dependent plaintext wrapper; normalise it to a boolean. */
function asBool(plaintext: unknown): boolean {
  const v =
    plaintext && typeof plaintext === "object" && "value" in (plaintext as object)
      ? (plaintext as { value: unknown }).value
      : plaintext;
  if (typeof v === "boolean") return v;
  if (typeof v === "bigint") return v !== 0n;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "0" && v !== "" && v !== "0x0";
  return Boolean(v);
}

export function chainOracle(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  onTx?: (hash: Hex, label: string) => void;
}): Oracle {
  const { publicClient, walletClient, account, onTx } = opts;

  let caseId: bigint | null = null;

  async function send(
    functionName: "openCase" | "interrogate" | "accuse",
    args: readonly unknown[],
    value: bigint | undefined,
    label: string,
    onPhase?: (p: Phase) => void,
  ) {
    onPhase?.("confirm-in-wallet");
    // `value` is only meaningful for openCase; viem's overloads narrow it away for the
    // non-payable entrypoints, so the request is assembled once and cast at the boundary.
    const hash = await walletClient.writeContract({
      address: MENTALIST_ADDRESS,
      abi: MENTALIST_ABI,
      functionName,
      args,
      value,
      account,
      chain: walletClient.chain,
    } as never);
    onTx?.(hash, label);
    onPhase?.("mining");
    return publicClient.waitForTransactionReceipt({ hash });
  }

  return {
    kind: "chain",

    async open(config: CaseConfig) {
      const fee = (await publicClient.readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "quoteOpenFee",
        args: [config.suspects],
      })) as bigint;

      const receipt = await send(
        "openCase",
        [config.suspects, config.liars, config.focus, config.turnAt],
        fee,
        "opened the case",
      );

      // Read the id out of the event rather than guessing it from nextCaseId — another
      // player could have opened a case between our read and our write.
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MENTALIST_ABI, ...log });
          if (parsed.eventName === "CaseOpened") {
            caseId = (parsed.args as { caseId: bigint }).caseId;
            break;
          }
        } catch {
          /* not one of ours */
        }
      }
      if (caseId === null) throw new Error("could not find the case id in the receipt");

      // The layout genuinely is not knowable client-side; the post-mortem fills this in.
      return { caseId: Number(caseId), killer: -1, liars: [] } satisfies DealtCase;
    },

    async ask(witness, mask, onPhase): Promise<AskResult> {
      if (caseId === null) throw new Error("no case open");

      const receipt = await send(
        "interrogate",
        [caseId, witness, mask],
        undefined,
        "put the question",
        onPhase,
      );

      let answerHandle: Hex | null = null;
      let turnedWitness: number | null = null;
      let cost = 1;

      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MENTALIST_ABI, ...log });
          if (parsed.eventName === "Interrogated") {
            const a = parsed.args as { answerHandle: Hex; cost: number };
            answerHandle = a.answerHandle;
            cost = Number(a.cost);
          }
          if (parsed.eventName === "WitnessTurned") {
            turnedWitness = Number((parsed.args as { witness: number }).witness);
          }
        } catch {
          /* not one of ours */
        }
      }
      if (!answerHandle) throw new Error("no answer handle in the receipt");

      // Private decrypt — the handle was granted to this wallet and nobody else.
      onPhase?.("reading");
      const zap = await getZap();
      const [result] = await zap.attestedDecrypt(
        walletClient as never,
        [answerHandle],
        { backoffConfig: BACKOFF } as never,
      );

      onPhase?.("idle");
      return { answer: asBool(result.plaintext), cost, turnedWitness };
    },

    async accuse(seat, onPhase) {
      if (caseId === null) throw new Error("no case open");

      const receipt = await send("accuse", [caseId, seat], undefined, "named them", onPhase);

      let guiltHandles: Hex[] = [];
      let liarHandles: Hex[] = [];
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MENTALIST_ABI, ...log });
          if (parsed.eventName === "Accused") {
            const a = parsed.args as unknown as { guiltHandles: readonly Hex[]; liarHandles: readonly Hex[] };
            guiltHandles = [...a.guiltHandles];
            liarHandles = [...a.liarHandles];
          }
        } catch {
          /* not one of ours */
        }
      }

      // Public reveal — no wallet signature, and one round-trip for the whole board rather
      // than 2N sequential ones.
      onPhase?.("revealing");
      const zap = await getZap();
      const revealed = await zap.attestedReveal([...guiltHandles, ...liarHandles], {
        backoffConfig: BACKOFF,
      } as never);

      const byHandle = new Map(revealed.map((r) => [r.handle.toLowerCase(), r]));
      const readAt = (h: Hex) => asBool(byHandle.get(h.toLowerCase())?.plaintext);

      const guilt = guiltHandles.map(readAt);
      const liars = liarHandles.map(readAt);
      const killer = guilt.findIndex(Boolean);

      onPhase?.("idle");
      return {
        correct: killer === seat,
        truth: { caseId: Number(caseId), killer, liars },
      };
    },
  };
}
