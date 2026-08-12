/**
 * End-to-end proof of the whole thing on Base Sepolia, money included.
 *
 * Stakes real USDC into the market, opens a case, hears every suspect's one statement
 * through Inco's attested decryption, solves it the way a player would (no privileged
 * reads), names the man, files the attestation, and records the result against the pot.
 *
 * If this passes, the loop that matters works against a live covalidator and a live
 * market: the answers are encrypted, the lie is applied inside the enclave, the contract
 * rules on the verdict, and the pool settles on that ruling rather than on anything this
 * script asserted.
 *
 *   pnpm --filter contracts prove:market
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  decodeEventLog,
  bytesToHex,
  pad,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { Lightning } from "@inco/lightning-js/lite";
import * as dotenv from "dotenv";

dotenv.config();

const GAME = "0xCF72B6D36619861521BF1b04f3A64e3647aE9356" as Hex;
const MARKET = "0x8b1508f518e4a04961c5f57ad6734304574f05f7" as Hex;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex;

/** Case 6: Sanguine. Three left, two of them lying. */
const CASE_INDEX = 6;
const N = 3;
const LIARS = 2;
const CLAIMS = [6, 4, 3];
const STAKE = 1_000_000n; // 1.00 USDC

const GAME_ABI = [
  { type: "function", name: "openCase", stateMutability: "payable",
    inputs: [{ name: "suspects", type: "uint8" }, { name: "liars", type: "uint8" },
             { name: "focus", type: "uint8" }, { name: "turnAt", type: "uint8" }],
    outputs: [{ name: "caseId", type: "uint256" }] },
  { type: "function", name: "quoteOpenFee", stateMutability: "view",
    inputs: [{ name: "suspects", type: "uint8" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "interrogate", stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint256" }, { name: "witness", type: "uint8" }, { name: "mask", type: "uint16" }],
    outputs: [] },
  { type: "function", name: "accuse", stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint256" }, { name: "seat", type: "uint8" }], outputs: [] },
  { type: "function", name: "settle", stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint256" },
             { name: "attestation", type: "tuple", components: [{ name: "handle", type: "bytes32" }, { name: "value", type: "bytes32" }] },
             { name: "signatures", type: "bytes[]" }], outputs: [] },
  { type: "function", name: "verdictHandle", stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "getCase", stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "detective", type: "address" }, { name: "suspects", type: "uint8" },
      { name: "liars", type: "uint8" }, { name: "focusLeft", type: "uint8" },
      { name: "questionsAsked", type: "uint8" }, { name: "accusedSeat", type: "uint8" },
      { name: "turnAt", type: "uint8" }, { name: "turned", type: "bool" },
      { name: "solved", type: "bool" }, { name: "status", type: "uint8" },
      { name: "openedAt", type: "uint64" }] }] },
  { type: "event", name: "CaseOpened", inputs: [
    { name: "caseId", type: "uint256", indexed: true }, { name: "detective", type: "address", indexed: true },
    { name: "suspects", type: "uint8" }, { name: "liars", type: "uint8" },
    { name: "focus", type: "uint8" }, { name: "turnAt", type: "uint8" }] },
  { type: "event", name: "Interrogated", inputs: [
    { name: "caseId", type: "uint256", indexed: true },
    { name: "detective", type: "address", indexed: true },
    { name: "questionId", type: "uint16" }, { name: "witness", type: "uint8" },
    { name: "mask", type: "uint16" }, { name: "cost", type: "uint8" },
    { name: "answerHandle", type: "bytes32" }] },
] as const;

const MARKET_ABI = [
  { type: "function", name: "enter", stateMutability: "nonpayable",
    inputs: [{ name: "caseIndex", type: "uint8" }, { name: "caseId", type: "uint256" }, { name: "stake", type: "uint256" }],
    outputs: [] },
  { type: "function", name: "recordResult", stateMutability: "nonpayable",
    inputs: [{ name: "caseIndex", type: "uint8" }], outputs: [] },
  { type: "function", name: "rounds", stateMutability: "view",
    inputs: [{ name: "", type: "uint8" }],
    outputs: [{ name: "closesAt", type: "uint64" }, { name: "pot", type: "uint128" },
              { name: "winningStake", type: "uint128" }, { name: "entrants", type: "uint32" },
              { name: "winners", type: "uint32" }, { name: "sealed_", type: "bool" }] },
  { type: "function", name: "entries", stateMutability: "view",
    inputs: [{ name: "", type: "uint8" }, { name: "", type: "address" }],
    outputs: [{ name: "stake", type: "uint128" }, { name: "caseId", type: "uint256" },
              { name: "deadline", type: "uint64" }, { name: "recorded", type: "bool" },
              { name: "won", type: "bool" }, { name: "claimed", type: "bool" }] },
  { type: "function", name: "shareOf", stateMutability: "view",
    inputs: [{ name: "caseIndex", type: "uint8" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "timeLeft", stateMutability: "view",
    inputs: [{ name: "caseIndex", type: "uint8" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const REWARDS_ABI = [
  { type: "function", name: "withdraw", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

const BACKOFF = { maxRetries: 12, baseDelayInMs: 1200 };

/** The covalidator is eventually consistent right after a write, so "acl disallowed" is not terminal. */
async function decryptWithPatience(zap: any, walletClient: any, handles: Hex[]) {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await zap.attestedDecrypt(walletClient, handles, { backoffConfig: BACKOFF });
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw last;
}

const asBool = (v: unknown) => BigInt(v as string) !== 0n;

/**
 * Solve it the way a player has to: from the statements alone.
 *
 * For each candidate killer, every suspect's honesty is forced by what he said, so a
 * candidate survives only if the liar count it implies is one the dealer could have
 * produced and the candidate is himself a liar.
 */
function solve(said: boolean[]): number[] {
  const out: number[] = [];
  for (let k = 0; k < N; k++) {
    let liars = 0;
    let killerLies = false;
    for (let i = 0; i < N; i++) {
      const inSet = ((CLAIMS[i]! >> k) & 1) === 1;
      const lying = said[i]! !== inSet;
      if (lying) liars++;
      if (i === k && lying) killerLies = true;
    }
    if (killerLies && (liars === LIARS || liars === LIARS + 1)) out.push(k);
  }
  return out;
}

async function main() {
  const pk = process.env.PRIVATE_KEY_BASE_SEPOLIA as Hex;
  if (!pk) throw new Error("PRIVATE_KEY_BASE_SEPOLIA missing");

  const account = privateKeyToAccount(pk);
  const transport = http(process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com");
  const pub = createPublicClient({ chain: baseSepolia, transport });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });

  console.log(`player  ${account.address}`);
  console.log(`game    ${GAME}`);
  console.log(`market  ${MARKET}\n`);

  const send = async (address: Hex, abi: any, fn: string, args: any[], value?: bigint) => {
    const hash = await wallet.writeContract({ address, abi, functionName: fn, args, value } as any);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    return r;
  };
  const pick = (r: any, name: string) => {
    for (const log of r.logs) {
      try {
        const p = decodeEventLog({ abi: GAME_ABI, ...log } as any);
        if (p.eventName === name) return p.args as any;
      } catch { /* not ours */ }
    }
    return null;
  };

  // ── funding ──
  const usdcBalance = async () => {
    for (let i = 0; i < 12; i++) {
      const b = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
      if (b >= STAKE || i === 11) return b;
      await new Promise((r) => setTimeout(r, 800));
    }
    return 0n;
  };
  let bal = await usdcBalance();
  if (bal < STAKE) {
    const rewards = (process.env.REWARDS_ADDRESS ?? "0x0F8c0BF8dC939662B5bCB61F304dA6E47dC68726") as Hex;
    console.log(`recovering USDC from the old reward treasury at ${rewards}…`);
    await send(rewards, REWARDS_ABI, "withdraw", [account.address, 10_000_000n]);
    bal = await usdcBalance();
  }
  console.log(`USDC on hand: ${Number(bal) / 1e6}\n`);

  // ── stake ──
  //
  // Resume rather than restart. One entry per wallet per round is the rule, so a rerun has
  // to pick up the case it already paid for and carry on from whatever state it is in.
  const existing: any = await pub.readContract({ address: MARKET, abi: MARKET_ABI, functionName: "entries", args: [CASE_INDEX, account.address] });
  let caseId: bigint;
  if (existing[0] > 0n) {
    caseId = existing[1] as bigint;
    console.log(`resuming case #${caseId} (already staked ${Number(existing[0]) / 1e6} USDC)`);
  } else {
    await send(USDC, ERC20_ABI, "approve", [MARKET, STAKE]);
    const fee = await pub.readContract({ address: GAME, abi: GAME_ABI, functionName: "quoteOpenFee", args: [N] });
    const openReceipt = await send(GAME, GAME_ABI, "openCase", [N, LIARS, N, 0], fee as bigint);
    caseId = pick(openReceipt, "CaseOpened").caseId as bigint;
    console.log(`case #${caseId} dealt`);
  }

  /**
   * Read until the answer stops changing.
   *
   * Base Sepolia's public endpoints are load balanced, so a read issued straight after a
   * receipt can land on a node that has not seen the block yet. Returning the first answer
   * produced a run that reported a solved case as a miss, which is a lie about the chain
   * rather than a finding about the contract.
   */
  const stable = async <T,>(read: () => Promise<T>, key: (v: T) => string): Promise<T> => {
    let last: T | null = null;
    let agreed = 0;
    for (let i = 0; i < 40; i++) {
      const v = await read();
      if (last !== null && key(v) === key(last)) {
        if (++agreed >= 2) return v;
      } else {
        agreed = 0;
      }
      last = v;
      await new Promise((r) => setTimeout(r, 500));
    }
    return last as T;
  };

  const caseState = async () =>
    stable<any>(
      () => pub.readContract({ address: GAME, abi: GAME_ABI, functionName: "getCase", args: [caseId] }) as any,
      (c) => `${c.detective}:${c.status}:${c.solved}:${c.questionsAsked}`,
    );

  if (existing[0] === 0n) {
    await caseState();
    await send(MARKET, MARKET_ABI, "enter", [CASE_INDEX, caseId, STAKE]);
  }
  const round0: any = await pub.readContract({ address: MARKET, abi: MARKET_ABI, functionName: "rounds", args: [CASE_INDEX] });
  console.log(`pot is ${Number(round0[1]) / 1e6} USDC across ${round0[3]} entrant(s)\n`);

  // ── the room ──
  const zap = await Lightning.baseSepoliaTestnet();
  let c0: any = await caseState();
  const said: boolean[] = [];
  for (let w = Number(c0.questionsAsked); w < N; w++) {
    const r = await send(GAME, GAME_ABI, "interrogate", [caseId, w, CLAIMS[w]!]);
    const ev = pick(r, "Interrogated");
    const [res] = await decryptWithPatience(zap, wallet, [ev.answerHandle]);
    const answer = asBool(res.plaintext?.value ?? res.plaintext);
    said.push(answer);
    const about = Array.from({ length: N }, (_, j) => j).filter((j) => ((CLAIMS[w]! >> j) & 1) === 1);
    console.log(`  suspect ${w} on {${about.join(",")}}: ${answer ? "IT WAS THEM" : "IT WASN'T THEM"}`);
  }

  let named = Number(c0.accusedSeat);
  let candidates: number[] = [];
  if (said.length === N) {
    candidates = solve(said);
    console.log(`\nstatements leave ${candidates.length} candidate(s): ${candidates.join(", ")}`);
    named = candidates[0] ?? 0;
    console.log(`naming suspect ${named}`);
  } else {
    console.log(`\n(resumed past the interrogation; suspect ${named} was already named)`);
  }

  // ── verdict ──
  //
  // The contract, not this script, rules on the accusation: it verifies the covalidator's
  // signatures over the verdict handle and only then sets `solved`. Everything downstream
  // settles on that flag.
  c0 = await caseState();
  if (Number(c0.status) === 1) await send(GAME, GAME_ABI, "accuse", [caseId, named]);
  const handle = (await pub.readContract({ address: GAME, abi: GAME_ABI, functionName: "verdictHandle", args: [caseId] })) as Hex;
  const [raw] = await decryptWithPatience(zap, wallet, [handle]);
  const correct = asBool(raw.plaintext?.value ?? raw.plaintext);
  c0 = await caseState();
  if (Number(c0.status) === 2) {
    const signatures = (raw.covalidatorSignatures as Uint8Array[]).map((sig) => bytesToHex(sig));
    await send(GAME, GAME_ABI, "settle", [
      caseId,
      { handle, value: pad(toHex(correct ? 1 : 0), { size: 32 }) },
      signatures,
    ]);
  }
  const closed: any = await caseState();
  console.log(`contract ruled: ${closed.solved ? "CORRECT" : "WRONG MAN"}`);

  // ── the pot ──
  const before: any = await pub.readContract({ address: MARKET, abi: MARKET_ABI, functionName: "entries", args: [CASE_INDEX, account.address] });
  if (!before[3]) await send(MARKET, MARKET_ABI, "recordResult", [CASE_INDEX]);
  const entry: any = await stable<any>(
    () => pub.readContract({ address: MARKET, abi: MARKET_ABI, functionName: "entries", args: [CASE_INDEX, account.address] }) as any,
    (e) => `${e[0]}:${e[3]}:${e[4]}`,
  );
  const share = await stable<bigint>(
    () => pub.readContract({ address: MARKET, abi: MARKET_ABI, functionName: "shareOf", args: [CASE_INDEX, account.address] }) as any,
    (v) => String(v),
  );
  const round: any = await stable<any>(
    () => pub.readContract({ address: MARKET, abi: MARKET_ABI, functionName: "rounds", args: [CASE_INDEX] }) as any,
    (r) => `${r[1]}:${r[2]}:${r[4]}`,
  );

  console.log(`\nrecorded: won=${entry[4]}  share=${Number(share) / 1e6} USDC`);
  console.log(`round: pot ${Number(round[1]) / 1e6}, winning stake ${Number(round[2]) / 1e6}, ${round[3]} entrants, ${round[4]} winners`);

  const checks: [string, boolean][] = [
    ["market took the stake", round[1] >= STAKE],
    ["entry is bound to the case that was dealt", entry[1] === caseId],
    ["the contract's ruling and the market agree", entry[4] === closed.solved],
    ["a solved case has a share, a missed one does not", closed.solved ? share > 0n : share === 0n],
    ["deduction narrowed the room", candidates.length === 0 || candidates.length < N],
  ];
  console.log("");
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
