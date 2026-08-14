import { NextResponse } from "next/server";
import { createPublicClient, fallback, http } from "viem";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/network";
import { CASEBOOK } from "@/lib/casebook";
import { ANSWERS } from "@/lib/answers";
import { person } from "@/lib/canon";

/**
 * The reveal, released by the chain rather than by the page.
 *
 * The answers used to sit in `casebook.ts`, which is tracked and ships to every browser, so
 * anybody could read the killer out of the bundle before placing a bet. They live server side
 * now, and this is the only way out of the building: it reads the case straight off the
 * contract and refuses unless that case is settled. Before settlement there is nothing here
 * to take, and after it the answer is public anyway, because the room has been paid out.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const caseId = Number(new URL(request.url).searchParams.get("case"));
  if (!Number.isInteger(caseId) || caseId < 0 || caseId >= CASEBOOK.length) {
    return NextResponse.json({ error: "no such case" }, { status: 404 });
  }

  const pub = createPublicClient({
    chain: activeChain,
    transport: fallback([
      http("https://base-sepolia-rpc.publicnode.com"),
      http("https://base-sepolia.gateway.tenderly.co"),
      http("https://sepolia.base.org"),
    ]),
  });

  try {
    const c = (await pub.readContract({
      address: MENTALIST_ADDRESS,
      abi: MENTALIST_ABI,
      functionName: "cases",
      args: [caseId],
    })) as readonly [bigint, number, bigint, bigint, number, number, boolean, boolean, number];

    // `settled` is the gate, not `closesAt`. A case that has closed but not been settled can
    // still be filed against, and handing out the answer in that window would let somebody
    // read it here and act on it there.
    if (!c[6]) {
      return NextResponse.json({ error: "case is not settled" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "could not read the case" }, { status: 503 });
  }

  const answer = ANSWERS[caseId];
  const chapter = CASEBOOK[caseId];
  if (!answer || !chapter) {
    return NextResponse.json({ error: "no such case" }, { status: 404 });
  }

  return NextResponse.json({
    name: person(chapter.roster[answer.id]!).name,
    alibi: chapter.alibis[answer.id]?.text ?? "",
    tell: answer.tell,
  });
}
