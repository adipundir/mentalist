
/**
 * The two confidential operations this game needs, and nothing else.
 *
 * **Sealing a bet.** The person you are backing is encrypted here, in your browser, before
 * anything leaves it. The id never appears in the calldata, the logs, or on any explorer,
 * so nobody can watch the informed money and copy it.
 *
 * **Attesting a verdict.** `Mentalist.stake` compares your sealed bet to the sealed answer
 * inside the enclave and grants the resulting bit to you alone. Reading it back is a
 * private decrypt: the covalidator signs over the value, and those signatures are what the
 * contract verifies. The contract rules on who won, not this browser.
 */

import type { Hex, WalletClient } from "viem";
import { bytesToHex, pad, toHex } from "viem";
import { handleTypes } from "@inco/lightning-js";
import { getIncoLightning } from "./network";

/** Shared retry policy: quick first attempt, patient tail. */
const BACKOFF = { maxRetries: 12, baseDelayInMs: 350, backoffFactor: 1.4 } as const;

type Zap = Awaited<ReturnType<typeof getIncoLightning>>;

let zapPromise: Promise<Zap> | null = null;

/**
 * Cold-init costs hundreds of milliseconds, so warm it on mount rather than at the moment
 * of staking, otherwise the first encrypt of a session is the slowest one and it lands in
 * front of a player who has already decided.
 */
export function getZap(): Promise<Zap> {
  if (!zapPromise) {
    zapPromise = getIncoLightning().catch((e) => {
      // Only a successful init is worth remembering. Init reads the verifier contract over
      // RPC, so it can fail on a blip, and caching that failure would break staking and
      // filing for the rest of the session with nothing but a reload to recover.
      zapPromise = null;
      throw e;
    });
  }
  return zapPromise;
}

/**
 * The SDK's backoff retries "ciphertext not found", but treats PermissionDenied
 * ("acl disallowed") as terminal, and that one is not actually terminal here.
 *
 * Measured on Base Sepolia: for a second or two after a write lands, the covalidator can
 * see a handle before it has indexed the `e.allow` that came with it. The grant is
 * genuinely on-chain by then, the enclave just hasn't caught up. That is a
 * read-your-own-write race, not an authorisation failure.
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

/** Seal a person id for `Mentalist`. Only that contract, for that account, can use it. */
export async function sealPersonId(
  personId: number,
  opts: { account: `0x${string}`; game: `0x${string}` },
): Promise<Hex> {
  const zap = await getZap();
  return (await zap.encrypt(BigInt(personId), {
    accountAddress: opts.account,
    dappAddress: opts.game,
    handleType: handleTypes.euint256,
  })) as Hex;
}

/**
 * Ask the covalidator for your verdict bit, in the form the contract will accept.
 *
 * `value` is re-encoded to the canonical padded bytes32 the covalidator signed over.
 * Inventing it would fail `isValidDecryptionAttestation`, which is the point of filing it.
 */
export async function attestVerdict(
  wallet: WalletClient,
  handle: Hex,
): Promise<{ won: boolean; attestation: { handle: Hex; value: Hex }; signatures: Hex[] }> {
  const zap = await getZap();
  const [result] = await withPatience(() =>
    zap.attestedDecrypt(wallet as never, [handle] as never, {
      backoffConfig: BACKOFF,
    } as never),
  );

  const won = asBool((result as { plaintext: unknown }).plaintext);
  return {
    won,
    attestation: { handle, value: pad(toHex(won ? 1 : 0), { size: 32 }) },
    signatures: (result as { covalidatorSignatures: Uint8Array[] }).covalidatorSignatures.map(
      (sig) => bytesToHex(sig),
    ),
  };
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
