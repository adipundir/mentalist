/**
 * Deploys `Mentalist` to Base Sepolia and opens all seven cases.
 *
 * Deploying it is not enough to make the game playable: `cases(i).exists` is false until
 * somebody calls `openCase`, and `openCase` is `onlyOwner`, so no player can do it for
 * themselves. Every case therefore has to be opened here, by the same key that deployed the
 * contract, or the board is seven permanently closed rows.
 *
 * The answers are read straight out of `frontend/lib/casebook.ts` rather than copied into a
 * table here. They are the same seven rows of data and a second copy of them is a second
 * thing to get wrong: a drifted answer would settle the market on the wrong man, silently,
 * because nothing on chain can be compared against the alibis afterwards.
 *
 * Each answer is encrypted on this machine before it goes anywhere, so the person id is
 * never in the calldata or in a log. It is in the repository, in the mentalist, in the open,
 * and that is deliberate: the ciphertext is not hiding the puzzle from a careful reader. It
 * fixes the answer before the first bet so settlement is trustless, and it keeps every
 * player's bet private so nobody can follow the informed money.
 *
 *   pnpm --filter contracts deploy:mentalist
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { Lightning } from "@inco/lightning-js/lite";
import { handleTypes } from "@inco/lightning-js";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASEBOOK } from "../../frontend/lib/casebook";

dotenv.config();

/** Megapot V2's `JackpotRandomTicketBuyer` on Base Sepolia. The payout rail. */
const MEGAPOT_BUYER = "0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746" as const;

/**
 * How long each case takes money. A week, so a season of one case a day is entirely open by
 * the time the last one lands. `openCase` refuses anything under an hour.
 */
const OPEN_FOR = BigInt(process.env.MENTALIST_OPEN_FOR ?? 30 * 60);

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const p = join(process.cwd(), "artifacts/contracts", `${name}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode as Hex };
}

/** Red John's seat: the one account in the room that cannot be true. */
function answerOf(index: number): number {
  const seat = CASEBOOK[index]!.alibis.findIndex((a) => a.impossible);
  if (seat < 0) throw new Error(`case ${index} has no impossible alibi`);
  return seat;
}

async function main() {
  const key = process.env.PRIVATE_KEY_BASE_SEPOLIA;
  if (!key) throw new Error("PRIVATE_KEY_BASE_SEPOLIA is not set");
  if (OPEN_FOR < 600n) throw new Error("MENTALIST_OPEN_FOR must be at least ten minutes");

  // Fail before spending gas rather than four cases in. Each room's alibi list has to match
  // the suspect count the contract is told, or a case is opened over a room that is not the
  // one the frontend paints.
  for (const [i, c] of CASEBOOK.entries()) {
    if (c.alibis.length !== c.suspects || c.roster.length !== c.suspects) {
      throw new Error(`case ${i} (${c.title}) does not agree with itself on how many people are in the room`);
    }
    answerOf(i);
  }

  const account = privateKeyToAccount(key as Hex);
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });

  console.log("deployer:", account.address);
  console.log("balance :", (await pub.getBalance({ address: account.address })).toString(), "wei\n");

  const book = artifact("Mentalist");
  const hash = await wallet.deployContract({
    abi: book.abi,
    bytecode: book.bytecode,
    args: [MEGAPOT_BUYER, account.address],
  });
  const addr = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
  console.log("Mentalist  ", addr, "\n");

  const zap = await Lightning.baseSepoliaTestnet();

  // Name the keeper, so the winners of these cases never have to come back and file to be
  // counted. It is not the owner and it holds no money: the most it can do is carry
  // covalidator-signed verdicts on-chain, and refuse to.
  const keeper = process.env.KEEPER_ADDRESS;
  if (keeper) {
    const tx = await wallet.writeContract({
      address: addr,
      abi: book.abi,
      functionName: "setResolver",
      args: [keeper as Hex],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`resolver set: ${keeper}`);
  } else {
    console.log("no KEEPER_ADDRESS, so players will file their own verdicts");
  }

  for (const [i, c] of CASEBOOK.entries()) {
    // The ciphertext is bound to this account and this contract, and `openCase` ingests it
    // with `newEuint256(msg.sender)`, so the key that encrypts has to be the key that sends,
    // and it has to be the owner.
    const sealed = (await zap.encrypt(BigInt(answerOf(i)), {
      accountAddress: account.address,
      dappAddress: addr,
      handleType: handleTypes.euint256,
    })) as Hex;

    // Quoted per case rather than once: it is a live fee and it can move between sends. The
    // quote carries headroom, and whatever the ingest does not spend stays in the contract
    // as the float the next ingest draws on.
    const fee = (await pub.readContract({
      address: addr,
      abi: book.abi,
      functionName: "quoteFee",
    })) as bigint;

    const tx = await wallet.writeContract({
      address: addr,
      abi: book.abi,
      functionName: "openCase",
      args: [i, c.suspects, sealed, OPEN_FOR],
      value: fee,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`case ${i} open: ${c.title} (${c.suspects} suspects), taking money for ${OPEN_FOR}s`);
  }

  console.log("\nNEXT_PUBLIC_MENTALIST_ADDRESS=" + addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
