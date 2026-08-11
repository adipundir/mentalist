/**
 * End-to-end proof on Base Sepolia.
 *
 * Opens a real case, asks the control question, reads the answer back through Inco's
 * attested decryption, plays binary splits to a single suspect, accuses, and verifies the
 * revealed board. If this passes, the whole confidential loop works against a live
 * covalidator — not a mock.
 *
 *   pnpm --filter contracts play:onchain
 */
import { createPublicClient, createWalletClient, http, decodeEventLog, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { Lightning } from "@inco/lightning-js/lite";
import * as dotenv from "dotenv";

dotenv.config();

const GAME = (process.env.MENTALIST_ADDRESS ??
  "0xE6D6F2c1a80102A3DE2749B8d7EE43AddA4C9221") as Hex;

const ABI = [
  { type: "function", name: "openCase", stateMutability: "payable",
    inputs: [{ name: "suspects", type: "uint8" }, { name: "liars", type: "uint8" },
             { name: "focus", type: "uint8" }, { name: "turnAt", type: "uint8" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "interrogate", stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint256" }, { name: "witness", type: "uint8" },
             { name: "mask", type: "uint16" }],
    outputs: [{ type: "bytes32" }] },
  { type: "function", name: "accuse", stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint256" }, { name: "seat", type: "uint8" }], outputs: [] },
  { type: "function", name: "quoteOpenFee", stateMutability: "pure",
    inputs: [{ name: "suspects", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getCase", stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "detective", type: "address" }, { name: "suspects", type: "uint8" },
      { name: "liars", type: "uint8" }, { name: "focusLeft", type: "uint8" },
      { name: "questionsAsked", type: "uint8" }, { name: "accusedSeat", type: "uint8" },
      { name: "turnAt", type: "uint8" }, { name: "turned", type: "bool" },
      { name: "solved", type: "bool" }, { name: "status", type: "uint8" },
      { name: "openedAt", type: "uint64" }] }] },
  { type: "event", name: "CaseOpened",
    inputs: [{ name: "caseId", type: "uint256", indexed: true },
             { name: "detective", type: "address", indexed: true },
             { name: "suspects", type: "uint8" }, { name: "liars", type: "uint8" },
             { name: "focus", type: "uint8" }, { name: "turnAt", type: "uint8" }] },
  { type: "event", name: "Interrogated",
    inputs: [{ name: "caseId", type: "uint256", indexed: true },
             { name: "detective", type: "address", indexed: true },
             { name: "questionId", type: "uint16" }, { name: "witness", type: "uint8" },
             { name: "mask", type: "uint16" }, { name: "cost", type: "uint8" },
             { name: "answerHandle", type: "bytes32" }] },
  { type: "event", name: "Accused",
    inputs: [{ name: "caseId", type: "uint256", indexed: true },
             { name: "detective", type: "address", indexed: true },
             { name: "seat", type: "uint8" }, { name: "verdict", type: "bytes32" },
             { name: "guiltHandles", type: "bytes32[]" }, { name: "liarHandles", type: "bytes32[]" }] },
] as const;

const BACKOFF = { maxRetries: 12, baseDelayInMs: 350, backoffFactor: 1.4 };
const N = 9, LIARS = 3, FOCUS = 6;

/**
 * The SDK's own backoff retries "ciphertext not found", but treats PermissionDenied
 * ("acl disallowed") as terminal. Right after `interrogate` lands, the covalidator can
 * briefly see the handle before it has indexed the `allow` that came with it — the grant
 * is on-chain (isAllowed returns true) but the enclave hasn't caught up. That is a
 * read-your-own-write race, not a real authorisation failure, so it needs an outer retry.
 */
async function decryptWithPatience(zap: any, walletClient: any, handles: Hex[], reveal = false) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return reveal
        ? await zap.attestedReveal(handles, { backoffConfig: BACKOFF })
        : await zap.attestedDecrypt(walletClient, handles, { backoffConfig: BACKOFF });
    } catch (e) {
      lastErr = e;
      const msg = String((e as any)?.cause ?? e);
      if (!/acl disallowed|not found|PermissionDenied|threshold/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const asBool = (p: any) => {
  const v = p && typeof p === "object" && "value" in p ? p.value : p;
  return typeof v === "bigint" ? v !== 0n : Boolean(v);
};

async function main() {
  const pk = process.env.PRIVATE_KEY_BASE_SEPOLIA as Hex;
  if (!pk) throw new Error("PRIVATE_KEY_BASE_SEPOLIA missing");

  const account = privateKeyToAccount(pk);
  const transport = http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

  console.log(`detective ${account.address}`);
  console.log(`game      ${GAME}\n`);

  const zap = await Lightning.baseSepoliaTestnet();
  console.log("Inco SDK ready\n");

  const send = async (fn: any, args: any[], value?: bigint) => {
    const hash = await walletClient.writeContract({ address: GAME, abi: ABI, functionName: fn, args, value } as any);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    return r;
  };
  const pick = (r: any, name: string) => {
    for (const log of r.logs) {
      try {
        const p = decodeEventLog({ abi: ABI, ...log } as any);
        if (p.eventName === name) return p.args as any;
      } catch {}
    }
    return null;
  };

  // ── open ──
  const fee = await publicClient.readContract({ address: GAME, abi: ABI, functionName: "quoteOpenFee", args: [N] }) as bigint;
  const t0 = Date.now();
  const openReceipt = await send("openCase", [N, LIARS, FOCUS, 0], fee);
  const caseId = pick(openReceipt, "CaseOpened").caseId as bigint;
  console.log(`case #${caseId} opened in ${Date.now() - t0}ms  (fee ${fee} wei, gas ${openReceipt.gasUsed})`);

  // sepolia.base.org is load-balanced: a receipt confirmed by one node does not mean the
  // next eth_call lands on a node that has the block. viem simulates before every write,
  // so without this the first interrogate can revert WrongStatus() against stale state.
  for (let i = 0; i < 30; i++) {
    const c: any = await publicClient.readContract({ address: GAME, abi: ABI, functionName: "getCase", args: [caseId] });
    if (c.status === 1) { if (i) console.log(`  (waited ${i * 400}ms for state to propagate)`); break; }
    await new Promise((r) => setTimeout(r, 400));
  }

  const ask = async (witness: number, mask: number) => {
    const a = Date.now();
    const r = await send("interrogate", [caseId, witness, mask]);
    const ev = pick(r, "Interrogated");
    const mined = Date.now() - a;

    const b = Date.now();
    const [res] = await decryptWithPatience(zap, walletClient, [ev.answerHandle]);
    const answer = asBool(res.plaintext);
    console.log(`  witness ${witness} mask 0b${mask.toString(2).padStart(N, "0")} -> ${answer ? "YES" : "NO "}   (mined ${mined}ms, decrypt ${Date.now() - b}ms)`);
    return answer;
  };

  // ── the documented winning line ──
  console.log("\ncontrol question (is the Tyger one of all nine?):");
  const honest = await ask(0, (1 << N) - 1);
  console.log(`  -> witness 0 is ${honest ? "HONEST" : "A LIAR"} (read them ${honest ? "straight" : "inverted"})`);

  console.log("\nbinary splits:");
  let live = Array.from({ length: N }, (_, i) => i);
  while (live.length > 1) {
    const half = live.slice(0, Math.floor(live.length / 2));
    const mask = half.reduce((m, s) => m | (1 << s), 0);
    const said = await ask(0, mask);
    const inHalf = honest ? said : !said;
    live = inHalf ? half : live.filter((s) => !half.includes(s));
    console.log(`     still possible: ${live.map((s) => s + 1).join(", ")}`);
  }

  // ── accuse + public reveal ──
  const seat = live[0];
  console.log(`\nnaming seat ${seat + 1}...`);
  const accuseReceipt = await send("accuse", [caseId, seat]);
  const ev = pick(accuseReceipt, "Accused");

  const revealed = await decryptWithPatience(zap, walletClient, [...ev.guiltHandles, ...ev.liarHandles], true);
  const by = new Map(revealed.map((r: any) => [r.handle.toLowerCase(), r]));
  const read = (h: string) => asBool(by.get(h.toLowerCase())?.plaintext);

  const guilt = ev.guiltHandles.map(read);
  const liars = ev.liarHandles.map(read);
  const killer = guilt.findIndex(Boolean);

  console.log(`\nthe board:`);
  for (let i = 0; i < N; i++) {
    console.log(`  seat ${i + 1}  ${guilt[i] ? "THE TYGER" : "innocent "}  ${liars[i] ? "lied" : "truthful"}`);
  }

  const ok = killer === seat;
  console.log(`\n${ok ? "CASE CLOSED — the deduction was correct." : "MISS — named " + (seat + 1) + ", it was " + (killer + 1)}`);

  // Invariants the whole design rests on.
  const guiltCount = guilt.filter(Boolean).length;
  const liarCount = liars.filter(Boolean).length;
  const checks = [
    ["exactly one Tyger", guiltCount === 1],
    ["the Tyger lies", liars[killer] === true],
    ["liar count is LIARS or LIARS+1", liarCount === LIARS || liarCount === LIARS + 1],
    ["the deduction found him", ok],
  ] as const;
  console.log();
  for (const [label, pass] of checks) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
  if (checks.some(([, p]) => !p)) process.exit(1);
  console.log(`\ntotal wall clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
