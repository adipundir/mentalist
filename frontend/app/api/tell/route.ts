import { NextResponse } from "next/server";
import { createPublicClient, fallback, http } from "viem";
import { MENTALIST_CASES_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/network";
import { CASEBOOK } from "@/lib/casebook";
import { ANSWERS } from "@/lib/answers";

/**
 * The post-settlement reveal is server-configured. The contract is still checked for settlement
 * so the answer cannot be served early, while the encrypted on-chain answer remains the input
 * used by the verdict computations and payouts. The plaintext answer is never shipped in the
 * client bundle or committed to the repository.
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

  const pub = createPublicClient({ chain: activeChain, transport });

  try {
    const c = (await pub.readContract({
      address: MENTALIST_ADDRESS,
      abi: MENTALIST_CASES_ABI,
      functionName: "cases",
      args: [caseId],
    })) as readonly [bigint, number, bigint, bigint, number, number, boolean, boolean, number];

    if (!c[6]) return NextResponse.json({ error: "case is not settled" }, { status: 403 });
    const answer = ANSWERS[caseId];
    if (!answer?.name || !Number.isInteger(answer.personId)) {
      return NextResponse.json({ error: "answer is not configured on the server" }, { status: 503 });
    }
    if (chapter.roster[answer.personId] === undefined) {
      return NextResponse.json({ error: "configured answer is not in this case" }, { status: 500 });
    }

    return NextResponse.json({
      personId: answer.personId,
      name: answer.name,
      alibi: chapter.alibis[answer.personId]?.text ?? "",
      tell: ANSWERS[caseId]?.tell ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 200) : "could not read the answer" },
      { status: 503 },
    );
  }
}
