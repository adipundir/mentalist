"use client";

/**
 * The on-chain oracle: the `Oracle` interface the whole game runs on, backed by real
 * encrypted state.
 *
 * The two Inco read paths are used exactly where they belong:
 *
 *   - **Loop B, private decrypt** for testimony. `interrogate` grants the answer to the
 *     detective with `e.allow`, so it is read with `attestedDecrypt`: which needs the
 *     wallet to sign, because the handle is private. Nobody else can read it, not even by
 *     watching the chain.
 *   - **Loop A, public reveal** for the verdict. `accuse` calls `e.reveal` on the whole
 *     board, so `attestedReveal` needs no signature at all and the post-mortem paints for
 *     free.
 */

import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { bytesToHex, decodeEventLog, pad, toHex } from "viem";
import { Lightning } from "@inco/lightning-js/lite";
import { handleTypes } from "@inco/lightning-js";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "./contracts";
import type { CaseConfig, Phase } from "./case";
import type { AskResult, DealtCase, Oracle } from "./oracle";

/** Shared retry policy: quick first attempt, patient tail. One config, imported everywhere. */
export const BACKOFF = { maxRetries: 12, baseDelayInMs: 350, backoffFactor: 1.4 } as const;

/**
 * The SDK's backoff retries "ciphertext not found", but treats PermissionDenied
 * ("acl disallowed") as terminal, and that one is not actually terminal here.
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
 * question, otherwise the very first reveal in a session is the slowest one.
 */
export function getZap(): Promise<Zap> {
  if (!zapPromise) zapPromise = Lightning.baseSepoliaTestnet();
  return zapPromise;
}

/** The SDK returns a scheme-dependent plaintext wrapper; normalise it to a number. */
function asNumber(plaintext: unknown): number {
  const v =
    plaintext && typeof plaintext === "object" && "value" in (plaintext as object)
      ? (plaintext as { value: unknown }).value
      : plaintext;
  return Number(BigInt(v as string | number | bigint));
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
 * The on-chain oracle exposes two actions that exist only against a chain: Model A
 * settlement, and converting the result into Megapot tickets. Both are part of the loop, * a case that is never settled never advances a streak, and a streak that never advances
 * never earns a ticket.
 */
export interface ChainOracle extends Oracle {
  caseId(): number | null;
  /** Open the room and return, per seat, which written account that man gives. */
  hearRoom(onPhase?: (p: Phase) => void): Promise<number[]>;
  /**
   * Play a case that already exists.
   *
   * The market opens the case as part of taking your stake, so by the time the room is
   * playable the case is already dealt and already yours. This adopts it instead of opening
   * a second one and charging you twice.
   */
  adopt(id: bigint): void;
  /** Submit the covalidator attestation so the *contract* rules on your accusation. */
  settle(): Promise<{ hash: Hex; solved: boolean }>;
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
   * one of the handles that comes back, so settlement costs no extra covalidator
   * round-trip. The value is re-encoded to the canonical padded bytes32 the covalidator
   * signed over; inventing it would fail `isValidDecryptionAttestation`.
   */
  let verdict: { handle: Hex; value: Hex; signatures: Hex[]; solved: boolean } | null = null;

  /**
   * sepolia.base.org is load-balanced: a receipt confirmed by one node does not mean the
   * next eth_call reaches a node that has the block. viem also simulates before every
   * write. So after any state transition, wait until the new state is actually readable, * otherwise the next call either reverts against stale state or reads a stale answer.
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
    functionName: "openCase" | "beginHearing" | "accuse" | "settle",
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

      // Read the id out of the event rather than guessing it from nextCaseId, another
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

    /**
     * Open the room, and read every account in it.
     *
     * One transaction and one decryption for the whole case. What comes back is a slot
     * number per seat: which of the written accounts that man gives. The words themselves
     * live in the casebook where anyone can read them, so nothing here is a secret except
     * the casting, and the casting is the game.
     *
     * After this the interrogation is free. Clicking a suspect reveals what we already hold
     * rather than sending a transaction and putting a wallet signature between the player
     * and every single person in the room.
     */
    async hearRoom(onPhase): Promise<number[]> {
      if (caseId === null) throw new Error("no case open");

      const receipt = await send("beginHearing", [caseId], undefined, "opened the room", onPhase);

      let handles: Hex[] | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MENTALIST_ABI, ...log });
          if (parsed.eventName === "RoomOpened") {
            handles = [...(parsed.args as { statementHandles: readonly Hex[] }).statementHandles];
          }
        } catch {
          /* not one of ours */
        }
      }
      if (!handles?.length) throw new Error("the room reported no accounts");

      // Private decrypt: these were granted to this wallet and to nobody else.
      onPhase?.("reading");
      const zap = await getZap();
      const results = await withPatience(() =>
        zap.attestedDecrypt(walletClient as never, handles as never, {
          backoffConfig: BACKOFF,
        } as never),
      );

      onPhase?.("idle");
      return (results as { plaintext: unknown }[]).map((r) => asNumber(r.plaintext));
    },

    async accuse(seat, onPhase) {
      if (caseId === null) throw new Error("no case open");

      // Encrypt the name here, on this machine, before anything leaves it. The seat never
      // appears in the transaction, the logs, or any block explorer: the contract ingests a
      // ciphertext and compares it to the hidden seat inside the enclave. Without this the
      // whole wager would be public the moment it was placed.
      const zap = await getZap();

      // Does the deployed game take a sealed accusation?
      //
      // The encrypted path is the one that matters and the one this client prefers, but a
      // game deployed before it exists has no `quoteNameFee` and takes a plain seat. Asking
      // the chain which it is costs one read and means the app is never broken by the gap
      // between shipping a contract and shipping the page that talks to it.
      let fee: bigint | null = null;
      try {
        fee = (await publicClient.readContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "quoteNameFee",
        })) as bigint;
      } catch {
        fee = null;
      }

      let receipt;
      if (fee === null) {
        receipt = await send("accuse", [caseId, seat], undefined, "named him", onPhase);
      } else {
        // Encrypt the name here, on this machine, before anything leaves it. The seat never
        // appears in the transaction, the logs, or any block explorer.
        onPhase?.("encrypting");
        const sealed = await zap.encrypt(BigInt(seat), {
          accountAddress: account,
          dappAddress: MENTALIST_ADDRESS,
          handleType: handleTypes.euint256,
        });
        receipt = await send("accuse", [caseId, sealed], fee, "named him", onPhase);
      }

      let verdictHandle: Hex | null = null;
      let guiltHandles: Hex[] = [];
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MENTALIST_ABI, ...log });
          if (parsed.eventName === "Accused") {
            const a = parsed.args as { verdict: Hex; guiltHandles: readonly Hex[] };
            verdictHandle = a.verdict;
            guiltHandles = [...a.guiltHandles];
          }
        } catch {
          /* not one of ours */
        }
      }
      if (!verdictHandle) throw new Error("no verdict in the receipt");

      onPhase?.("reading");
      const [v, ...board] = await withPatience(() =>
        zap.attestedDecrypt(walletClient as never, [verdictHandle!, ...guiltHandles] as never, {
          backoffConfig: BACKOFF,
        } as never),
      );

      const solved = asBool((v as { plaintext: unknown }).plaintext);
      const killer = board.findIndex((b) => asBool((b as { plaintext: unknown }).plaintext));

      verdict = {
        handle: verdictHandle,
        value: pad(toHex(solved ? 1 : 0), { size: 32 }),
        signatures: ((v as { covalidatorSignatures: Uint8Array[] }).covalidatorSignatures).map(
          (sig) => bytesToHex(sig),
        ),
        solved,
      };

      onPhase?.("idle");
      return {
        correct: solved,
        truth: { caseId: Number(caseId), killer, liars: [] },
      };
    },

    caseId: () => (caseId === null ? null : Number(caseId)),

    adopt(id: bigint) {
      caseId = id;
    },

    async settle() {
      if (caseId === null || !verdict) throw new Error("nothing to settle");
      const receipt = await send(
        "settle",
        [caseId, { handle: verdict.handle, value: verdict.value }, verdict.signatures],
        undefined,
        "filed the report",
      );
      if (receipt.status !== "success") throw new Error("settlement reverted");

      // Same load-balancer race as `open`: the market reads this case's `solved` flag next,
      // and a lagging node still reporting Accused would record a win as a loss. Wait for
      // Closed before anyone asks.
      await waitForStatus(3);

      return { hash: receipt.transactionHash, solved: verdict.solved };
    },

  };
}
