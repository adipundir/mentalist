/**
 * Puts a real bet on a live case, so the settlement path runs against the chain rather than
 * only against the Foundry harness.
 *
 * Everything after `stake` is meant to happen without this script: the keeper files the room
 * and shuts the books on a schedule. That is exactly why this exists. The keeper's filing path
 * had never once executed in production, and a room with nobody in it exercises none of it, so
 * the only way to know it works is to put money in a room and watch what happens at the close.
 *
 *   MENTALIST_CASE=5 MENTALIST_PICK=3 MENTALIST_AMOUNT=100000 \
 *     npx hardhat run scripts/stake.ts --network baseSepolia
 *
 * `MENTALIST_PICK` is a person id. It is required so this script never has to read the
 * answer key.
 */
import { createPublicClient, createWalletClient, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { Lightning } from "@inco/lightning-js/lite";
import { handleTypes } from "@inco/lightning-js";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASEBOOK } from "../../frontend/lib/casebook";
import { MENTALIST_ADDRESS } from "../../frontend/lib/addresses";

dotenv.config();

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const CASE_ID = Number(process.env.MENTALIST_CASE ?? 5);
const AMOUNT = BigInt(process.env.MENTALIST_AMOUNT ?? 100_000); // 0.10 USDC, the floor
const PICK = process.env.MENTALIST_PICK === undefined ? NaN : Number(process.env.MENTALIST_PICK);
const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

async function main() {
  const key = process.env.PRIVATE_KEY_BASE_SEPOLIA;
  if (!key) throw new Error("PRIVATE_KEY_BASE_SEPOLIA is not set");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);

  const addr = MENTALIST_ADDRESS as Hex;

  const artifact = JSON.parse(
    readFileSync(join(__dirname, "../artifacts/contracts/Mentalist.sol/Mentalist.json"), "utf8"),
  );
  const abi = artifact.abi as Abi;

  const transport = http("https://base-sepolia-rpc.publicnode.com");
  const pub = createPublicClient({ chain: baseSepolia, transport });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });

  const c = CASEBOOK[CASE_ID];
  if (!Number.isInteger(PICK) || PICK < 0 || PICK >= c.suspects) {
    throw new Error(`MENTALIST_PICK must be a person id from 0 to ${c.suspects - 1}`);
  }

  const row = (await pub.readContract({ address: addr, abi, functionName: "cases", args: [CASE_ID] })) as
    readonly [bigint, number, bigint, bigint, number, number, boolean, boolean];
  const closesIn = Number(row[0]) - Math.floor(Date.now() / 1000);
  console.log(`case ${CASE_ID}: ${c.title}`);
  console.log(`picking person ${PICK} (${c.roster[PICK]})`);
  console.log(`closes in ${Math.floor(closesIn / 60)} min, pot ${row[2]}, entrants ${row[4]}`);
  if (closesIn <= 0) throw new Error("that case has already closed");

  const bal = (await pub.readContract({ address: USDC, abi: ERC20 as unknown as Abi, functionName: "balanceOf", args: [account.address] })) as bigint;
  if (bal < AMOUNT) throw new Error(`not enough USDC: have ${bal}, need ${AMOUNT}`);

  // The bet is sealed here, on this machine, bound to this account AND this contract. The
  // chain only ever sees the ciphertext, which is the whole point of the game.
  const zap = await Lightning.baseSepoliaTestnet();
  const sealed = (await zap.encrypt(BigInt(PICK), {
    accountAddress: account.address,
    dappAddress: addr,
    handleType: handleTypes.euint256,
  })) as Hex;

  const approveTx = await wallet.writeContract({
    address: USDC,
    abi: ERC20 as unknown as Abi,
    functionName: "approve",
    args: [addr, AMOUNT],
  });
  await pub.waitForTransactionReceipt({ hash: approveTx });
  console.log(`approved ${AMOUNT}`);

  const fee = (await pub.readContract({ address: addr, abi, functionName: "quoteFee" })) as bigint;
  const tx = await wallet.writeContract({
    address: addr,
    abi,
    functionName: "stake",
    args: [CASE_ID, sealed, AMOUNT],
    value: fee,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`staked: ${tx} (${receipt.status})`);

  const after = (await pub.readContract({ address: addr, abi, functionName: "cases", args: [CASE_ID] })) as typeof row;
  console.log(`pot is now ${after[2]}, entrants ${after[4]}`);
  console.log(`\nnothing else to do. the keeper files and settles this room on its own.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
