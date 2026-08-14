/**
 * Moves the closing time of an already-open Mentalist case.
 *
 * This is an owner operation. It does not touch the sealed answer, any bet, the pot, or the
 * settlement state. The contract rewrites only `cases(caseId).closesAt` to
 * `block.timestamp + openFor`.
 *
 *   MENTALIST_CASE=2 MENTALIST_OPEN_FOR=3600 \
 *     pnpm --filter contracts reschedule
 */
import { createPublicClient, createWalletClient, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MENTALIST_ADDRESS } from "../../frontend/lib/addresses";

dotenv.config();

const CASE_ID = Number(process.env.MENTALIST_CASE);
const OPEN_FOR = BigInt(process.env.MENTALIST_OPEN_FOR ?? "");

function artifact(name: string): { abi: Abi } {
  const p = join(process.cwd(), "artifacts/contracts", `${name}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi as Abi };
}

function formatDate(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString();
}

async function main() {
  const key = process.env.PRIVATE_KEY_BASE_SEPOLIA;
  if (!key) throw new Error("PRIVATE_KEY_BASE_SEPOLIA is not set");
  if (!Number.isInteger(CASE_ID) || CASE_ID < 0 || CASE_ID > 65535) {
    throw new Error("MENTALIST_CASE must be a uint16 case id");
  }
  if (OPEN_FOR < 600n) throw new Error("MENTALIST_OPEN_FOR must be at least 600 seconds");

  const addr = MENTALIST_ADDRESS as Hex;

  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });
  const { abi } = artifact("Mentalist");

  const before = (await pub.readContract({
    address: addr,
    abi,
    functionName: "cases",
    args: [CASE_ID],
  })) as readonly [bigint, number, bigint, bigint, number, number, boolean, boolean, number];

  if (!before[7]) throw new Error(`case ${CASE_ID} does not exist`);
  if (before[6]) throw new Error(`case ${CASE_ID} is already settled`);

  console.log(`owner: ${account.address}`);
  console.log(`case : ${CASE_ID}`);
  console.log(`was  : ${formatDate(before[0])}`);

  const hash = await wallet.writeContract({
    address: addr,
    abi,
    functionName: "reschedule",
    args: [CASE_ID, OPEN_FOR],
    account,
    chain: baseSepolia,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reschedule reverted: ${hash}`);

  const after = (await pub.readContract({
    address: addr,
    abi,
    functionName: "cases",
    args: [CASE_ID],
  })) as typeof before;

  console.log(`now  : ${formatDate(after[0])}`);
  console.log(`tx   : ${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
