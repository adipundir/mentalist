/**
 * Measure the real per-move cost on Base Sepolia with a WARM SDK.
 *
 * The earlier 5.5–11.3s figures came from cold starts with retries. The campaign's design
 * depends on what a warm, steady-state move actually costs, so this opens one case and
 * times six consecutive questions.
 */
import { createPublicClient, createWalletClient, http, decodeEventLog, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { Lightning } from "@inco/lightning-js/lite";
import * as dotenv from "dotenv";
dotenv.config();

const GAME = "0xE6D6F2c1a80102A3DE2749B8d7EE43AddA4C9221" as Hex;
const ABI = [
  { type:"function", name:"openCase", stateMutability:"payable",
    inputs:[{name:"suspects",type:"uint8"},{name:"liars",type:"uint8"},{name:"focus",type:"uint8"},{name:"turnAt",type:"uint8"}],
    outputs:[{type:"uint256"}] },
  { type:"function", name:"interrogate", stateMutability:"nonpayable",
    inputs:[{name:"caseId",type:"uint256"},{name:"witness",type:"uint8"},{name:"mask",type:"uint16"}], outputs:[{type:"bytes32"}] },
  { type:"function", name:"quoteOpenFee", stateMutability:"pure", inputs:[{name:"suspects",type:"uint8"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"getCase", stateMutability:"view", inputs:[{name:"caseId",type:"uint256"}],
    outputs:[{type:"tuple",components:[{name:"detective",type:"address"},{name:"suspects",type:"uint8"},{name:"liars",type:"uint8"},{name:"focusLeft",type:"uint8"},{name:"questionsAsked",type:"uint8"},{name:"accusedSeat",type:"uint8"},{name:"turnAt",type:"uint8"},{name:"turned",type:"bool"},{name:"solved",type:"bool"},{name:"status",type:"uint8"},{name:"openedAt",type:"uint64"}]}] },
  { type:"event", name:"CaseOpened", inputs:[{name:"caseId",type:"uint256",indexed:true},{name:"detective",type:"address",indexed:true},{name:"suspects",type:"uint8"},{name:"liars",type:"uint8"},{name:"focus",type:"uint8"},{name:"turnAt",type:"uint8"}] },
  { type:"event", name:"Interrogated", inputs:[{name:"caseId",type:"uint256",indexed:true},{name:"detective",type:"address",indexed:true},{name:"questionId",type:"uint16"},{name:"witness",type:"uint8"},{name:"mask",type:"uint16"},{name:"cost",type:"uint8"},{name:"answerHandle",type:"bytes32"}] },
] as const;

const BACKOFF = { maxRetries: 12, baseDelayInMs: 250, backoffFactor: 1.35 };

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY_BASE_SEPOLIA as Hex);
  const transport = http("https://sepolia.base.org");
  const pub = createPublicClient({ chain: baseSepolia, transport });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });

  const t0 = Date.now();
  const zap = await Lightning.baseSepoliaTestnet();
  console.log(`SDK cold init: ${Date.now() - t0}ms\n`);

  const fee = await pub.readContract({ address: GAME, abi: ABI, functionName: "quoteOpenFee", args: [9] }) as bigint;
  const tOpen = Date.now();
  const hash = await wallet.writeContract({ address: GAME, abi: ABI, functionName: "openCase", args: [9,3,40,0], value: fee } as any);
  const rc = await pub.waitForTransactionReceipt({ hash });
  let caseId = 0n;
  for (const log of rc.logs) { try { const d = decodeEventLog({ abi: ABI, ...log } as any); if (d.eventName==="CaseOpened") caseId = (d.args as any).caseId; } catch {} }
  console.log(`openCase: ${Date.now() - tOpen}ms  (case #${caseId})`);

  for (let i = 0; i < 30; i++) {
    const c: any = await pub.readContract({ address: GAME, abi: ABI, functionName: "getCase", args: [caseId] });
    if (c.status === 1) break;
    await new Promise(r => setTimeout(r, 300));
  }

  const mine: number[] = [], read: number[] = [];
  for (let q = 0; q < 6; q++) {
    const a = Date.now();
    const h = await wallet.writeContract({ address: GAME, abi: ABI, functionName: "interrogate", args: [caseId, q % 9, 0x0f] } as any);
    const r = await pub.waitForTransactionReceipt({ hash: h });
    mine.push(Date.now() - a);
    let handle: Hex | null = null;
    for (const log of r.logs) { try { const d = decodeEventLog({ abi: ABI, ...log } as any); if (d.eventName==="Interrogated") handle = (d.args as any).answerHandle; } catch {} }
    const b = Date.now();
    await zap.attestedDecrypt(wallet as any, [handle!], { backoffConfig: BACKOFF } as any);
    read.push(Date.now() - b);
    console.log(`  q${q+1}: mine ${mine[q]}ms · decrypt ${read[q]}ms · total ${mine[q]+read[q]}ms`);
  }

  const med = (a: number[]) => a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  console.log(`\nWARM MEDIANS  mine ${med(mine)}ms · decrypt ${med(read)}ms · per move ${med(mine)+med(read)}ms`);
}
main().catch(e => { console.error(e); process.exit(1); });
