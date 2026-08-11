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
import { bytesToHex, decodeEventLog, pad, toHex } from "viem";
import { Lightning } from "@inco/lightning-js/lite";
import { MENTALIST_ABI, MENTALIST_ADDRESS, REWARDS_ABI, REWARDS_ADDRESS } from "./contracts";
import type { CaseConfig, Phase } from "./case";
import type { AskResult, DealtCase, Oracle } from "./oracle";

/** Shared retry policy: quick first attempt, patient tail. One config, imported everywhere. */
export const BACKOFF = { maxRetries: 12, baseDelayInMs: 350, backoffFactor: 1.4 } as const;

/**
 * The SDK's backoff retries "ciphertext not found", but treats PermissionDenied
 * ("acl disallowed") as terminal — and that one is not actually terminal here.
 *
 * Measured on Base Sepolia: for a second or two after `interrogate` lands, the covalidator
 * can see the answer handle before it has indexed the `e.allow` that came with it. The
 * grant is genuinely on-chain by then (`inco.isAllowed(handle, detective)` returns true),
 * the enclave just hasn't caught up. That is a read-your-own-write race, not an
 * authorisation failure, and without this outer retry the very first question of every
 * session fails.
 */
async function withPatience<T>(attempt: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await attempt();
    } catch (e) {
      lastError = e;
      const msg = String((e as { cause?: unknown })?.cause ?? e);
      if (!/acl disallowed|not found|PermissionDenied|threshold/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

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

/**
 * The on-chain oracle exposes two actions the demo has no equivalent for: Model A
 * settlement, and converting the result into Megapot tickets. Both are part of the loop —
 * a case that is never settled never advances a streak, and a streak that never advances
 * never earns a ticket.
 */
export interface ChainOracle extends Oracle {
  caseId(): number | null;
  /** Submit the covalidator attestation so the *contract* rules on your accusation. */
  settle(): Promise<{ hash: Hex; solved: boolean }>;
  /** How many Megapot tickets this closed case is worth. */
  ticketsEarned(): Promise<number>;
  /** Buy them, gifted straight to the player and funded by the reward treasury. */
  claimTickets(): Promise<Hex>;
}

export function chainOracle(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  onTx?: (hash: Hex, label: string) => void;
}): ChainOracle {
  const { publicClient, walletClient, account, onTx } = opts;

  let caseId: bigint | null = null;

  /**
   * The verdict attestation, captured during `accuse`.
   *
   * `accuse` already pays for a public reveal of the whole board, and the verdict bit is
   * one of the handles that comes back — so settlement costs no extra covalidator
   * round-trip. The value is re-encoded to the canonical padded bytes32 the covalidator
   * signed over; inventing it would fail `isValidDecryptionAttestation`.
   */
  let verdict: { handle: Hex; value: Hex; signatures: Hex[]; solved: boolean } | null = null;

  /**
   * sepolia.base.org is load-balanced: a receipt confirmed by one node does not mean the
   * next eth_call reaches a node that has the block. viem also simulates before every
   * write. So after any state transition, wait until the new state is actually readable —
   * otherwise the next call either reverts against stale state or reads a stale answer.
   */
  async function waitForStatus(target: number) {
    const id = caseId;
    if (id === null) return;
    for (let i = 0; i < 30; i++) {
      const c = (await publicClient.readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "getCase",
        args: [id],
      })) as { status: number };
      if (c.status === target) return;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async function send(
    functionName: "openCase" | "interrogate" | "accuse" | "settle",
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

      // Status 1 = Open. See waitForStatus.
      await waitForStatus(1);

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
      const [result] = await withPatience(() =>
        zap.attestedDecrypt(walletClient as never, [answerHandle!], {
          backoffConfig: BACKOFF,
        } as never),
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
      const revealed = await withPatience(() =>
        zap.attestedReveal([...guiltHandles, ...liarHandles], {
          backoffConfig: BACKOFF,
        } as never),
      );

      const byHandle = new Map(revealed.map((r) => [r.handle.toLowerCase(), r]));
      const readAt = (h: Hex) => asBool(byHandle.get(h.toLowerCase())?.plaintext);

      const guilt = guiltHandles.map(readAt);
      const liars = liarHandles.map(readAt);
      const killer = guilt.findIndex(Boolean);

      const verdictRaw = byHandle.get(guiltHandles[seat].toLowerCase());
      if (verdictRaw) {
        verdict = {
          handle: verdictRaw.handle as Hex,
          value: pad(toHex(asBool(verdictRaw.plaintext) ? 1 : 0), { size: 32 }),
          signatures: (verdictRaw.covalidatorSignatures as Uint8Array[]).map((sig) => bytesToHex(sig)),
          solved: killer === seat,
        };
      }

      onPhase?.("idle");
      return {
        correct: killer === seat,
        truth: { caseId: Number(caseId), killer, liars },
      };
    },

    caseId: () => (caseId === null ? null : Number(caseId)),

    async settle() {
      if (caseId === null || !verdict) throw new Error("nothing to settle");
      const receipt = await send(
        "settle",
        [caseId, { handle: verdict.handle, value: verdict.value }, verdict.signatures],
        undefined,
        "filed the report",
      );
      if (receipt.status !== "success") throw new Error("settlement reverted");

      // Same load-balancer race as `open`: `ticketsEarned` reads the case, and a lagging
      // node still reporting Accused would report zero tickets for a case that just earned
      // some. Wait for Closed before anyone asks.
      await waitForStatus(3);

      return { hash: receipt.transactionHash, solved: verdict.solved };
    },

    async ticketsEarned() {
      if (caseId === null || !REWARDS_ADDRESS) return 0;
      const n = (await publicClient.readContract({
        address: REWARDS_ADDRESS,
        abi: REWARDS_ABI,
        functionName: "ticketsEarned",
        args: [caseId],
      })) as bigint;
      return Number(n);
    },

    async claimTickets() {
      if (caseId === null) throw new Error("no case");
      const hash = await walletClient.writeContract({
        address: REWARDS_ADDRESS,
        abi: REWARDS_ABI,
        functionName: "claimTickets",
        args: [caseId],
        account,
        chain: walletClient.chain,
      } as never);
      onTx?.(hash, "claimed Megapot tickets");
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}
