/**
 * Deploys the game and the market to Base Sepolia, and opens all seven rounds.
 *
 * Both contracts go out together because they have to agree: the market checks that the
 * case you hand it matches the lineup its round calls for, so the specs it is configured
 * with and the rosters the frontend opens cases with are the same seven rows of data.
 *
 *   pnpm --filter contracts deploy:market
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Hex,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

dotenv.config();

const MEGAPOT_BUYER = "0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746" as const;

/**
 * The seven cases, as the market must see them.
 *
 * Mirrors `frontend/lib/story.ts`. `questions` is the contract's focus budget, which is one
 * per suspect now that every man speaks exactly once.
 */
const ROUNDS = [
  { title: "Cinnabar Sunday", suspects: 4, liars: 1 },
  { title: "The Vermilion Hour", suspects: 6, liars: 2 },
  { title: "Oxblood Handshake", suspects: 8, liars: 3 },
  { title: "Seven Shades of Crimson", suspects: 7, liars: 3 },
  { title: "Carmine on Her Cheek", suspects: 6, liars: 4 },
  { title: "Claret and Brimstone", suspects: 5, liars: 4 },
  { title: "Sanguine", suspects: 3, liars: 2 },
] as const;

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const p = join(
    process.cwd(),
    "artifacts/contracts",
    `${name}.sol`,
    `${name}.json`,
  );
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode as Hex };
}

async function main() {
  const key = process.env.PRIVATE_KEY_BASE_SEPOLIA;
  if (!key) throw new Error("PRIVATE_KEY_BASE_SEPOLIA is not set");

  const account = privateKeyToAccount(key as Hex);
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });

  console.log("deployer:", account.address);
  console.log("balance :", (await pub.getBalance({ address: account.address })).toString(), "wei\n");

  // The game sponsors its own Inco fees out of this float. Sized in the Ignition module's
  // comment: roughly 2,000 dealt cases.
  const game = artifact("Mentalist");
  let hash = await wallet.deployContract({
    abi: game.abi,
    bytecode: game.bytecode,
    args: [],
    value: parseEther("0.0003"),
  });
  const gameAddr = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
  console.log("Mentalist  ", gameAddr);

  const market = artifact("CaseMarket");
  hash = await wallet.deployContract({
    abi: market.abi,
    bytecode: market.bytecode,
    args: [gameAddr, MEGAPOT_BUYER, account.address],
  });
  const marketAddr = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
  console.log("CaseMarket ", marketAddr, "\n");

  for (const [i, r] of ROUNDS.entries()) {
    const tx = await wallet.writeContract({
      address: marketAddr,
      abi: market.abi,
      functionName: "configureRound",
      // suspects, liars, questions (one per suspect), turnAt (the turncoat is off)
      args: [i, r.suspects, r.liars, r.suspects, 0],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`round ${i} open: ${r.title} (${r.suspects} suspects, ${r.liars} lying)`);
  }

  console.log("\nNEXT_PUBLIC_MENTALIST_ADDRESS=" + gameAddr);
  console.log("NEXT_PUBLIC_MARKET_ADDRESS=" + marketAddr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
