import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/network";
import { CASEBOOK } from "@/lib/casebook";
import { ANSWERS } from "@/lib/answers";
import { person } from "@/lib/canon";
import { getZap } from "@/lib/inco";

/**
 * The reveal, taken from the chain rather than from a stored answer.
 *
 * Nothing here knows who the killer is. The id exists in one place only, as ciphertext in the
 * contract, and this asks the contract to open it: `revealAnswer` refuses until the case is
 * settled, so before then there is nothing to hand out and no way to hand it out early. After
 * settlement the room has been paid and the answer is worth nothing to trade on.
 *
 * Keeping a plaintext copy beside the ciphertext would have defeated the point of encrypting
 * it at all. Only the prose explanation is stored, and prose cannot be compared against a bet.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const transport = fallback([
  http("https://base-sepolia-rpc.publicnode.com"),
  http("https://base-sepolia.gateway.tenderly.co"),
  http("https://sepolia.base.org"),
]);

export async function GET(request: Request) {
  const caseId = Number(new URL(request.url).searchParams.get("case"));
  const chapter = CASEBOOK[caseId];
  if (!Number.isInteger(caseId) || !chapter) {
    return NextResponse.json({ error: "no such case" }, { status: 404 });
  }

  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key) return NextResponse.json({ error: "no key configured" }, { status: 503 });
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);

  const pub = createPublicClient({ chain: activeChain, transport });
  const wallet = createWalletClient({ account, chain: activeChain, transport });

  try {
    const c = (await pub.readContract({
      address: MENTALIST_ADDRESS,
      abi: MENTALIST_ABI,
      functionName: "cases",
      args: [caseId],
    })) as readonly [bigint, number, bigint, bigint, number, number, boolean, boolean, number];

    if (!c[6]) return NextResponse.json({ error: "case is not settled" }, { status: 403 });

    const handle = (await pub.readContract({
      address: MENTALIST_ADDRESS,
      abi: MENTALIST_ABI,
      functionName: "answerHandle",
      args: [caseId],
    })) as `0x${string}`;

    const zap = await getZap();
    const read = async () => {
      const [r] = await zap.attestedDecrypt(wallet as never, [handle] as never);
      return Number((r as { plaintext: { value: bigint } }).plaintext.value);
    };

    // Try to read it before paying to unlock it. The grant is permanent once made, so after
    // the first reveal of a case every later request is a pure read: sending `revealAnswer`
    // unconditionally would mean a transaction, and a fee, every time anybody opened a
    // settled case.
    let id: number;
    try {
      id = await read();
    } catch {
      const hash = await wallet.writeContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "revealAnswer",
        args: [caseId],
        chain: activeChain,
        account,
      });
      await pub.waitForTransactionReceipt({ hash });

      // The covalidator answers to the on-chain ACL and does not see the grant the instant it
      // mines, so the first read after a reveal can fail on timing alone. That is what a
      // freshly settled case looked like: an error, on a case the contract had already agreed
      // to open.
      let last: unknown;
      id = -1;
      for (let i = 0; i < 5; i++) {
        try {
          id = await read();
          break;
        } catch (err) {
          last = err;
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (id < 0) throw last;
    }

    const who = chapter.roster[id];
    if (who === undefined) {
      return NextResponse.json({ error: "the answer did not name anyone" }, { status: 500 });
    }

    return NextResponse.json({
      name: person(who).name,
      alibi: chapter.alibis[id]?.text ?? "",
      tell: ANSWERS[caseId]?.tell ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 200) : "could not read the answer" },
      { status: 503 },
    );
  }
}
