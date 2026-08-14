import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, fallback, http, isAddress, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/network";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function keeperAccount() {
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key) return null;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

const transport = fallback([
  http("https://base-sepolia-rpc.publicnode.com"),
  http("https://base-sepolia.gateway.tenderly.co"),
  http("https://sepolia.base.org"),
]);

/** Submit one payout and return after our transaction is mined, not after Megapot executes it. */
export async function POST(request: Request) {
  const account = keeperAccount();
  if (!account) return NextResponse.json({ error: "no keeper key configured" }, { status: 503 });

  let body: { caseId?: unknown; player?: unknown; wantTickets?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const caseId = Number(body.caseId);
  const player = typeof body.player === "string" ? body.player : "";
  const wantTickets = body.wantTickets === true;
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!Number.isInteger(caseId) || caseId < 0 || caseId > 65535 || !isAddress(player) || !signature) {
    return NextResponse.json({ error: "invalid payout request" }, { status: 400 });
  }

  const validIntent = await verifyTypedData({
    address: player,
    domain: {
      name: "Mentalist",
      version: "1",
      chainId: activeChain.id,
      verifyingContract: MENTALIST_ADDRESS,
    },
    types: {
      Payout: [
        { name: "caseId", type: "uint16" },
        { name: "player", type: "address" },
        { name: "wantTickets", type: "bool" },
      ],
    },
    primaryType: "Payout",
    message: { caseId, player: player as `0x${string}`, wantTickets },
    signature: signature as `0x${string}`,
  });
  if (!validIntent) return NextResponse.json({ error: "invalid payout signature" }, { status: 401 });

  const publicClient = createPublicClient({ chain: activeChain, transport });
  const wallet = createWalletClient({ account, chain: activeChain, transport });
  try {
    const hash = await wallet.writeContract({
      address: MENTALIST_ADDRESS,
      abi: MENTALIST_ABI,
      functionName: "payoutFor",
      args: [caseId, player as `0x${string}`, wantTickets],
      account,
      chain: activeChain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "payout transaction reverted", hash }, { status: 502 });
    }
    return NextResponse.json({ ok: true, hash, player, wantTickets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message.slice(0, 300) : String(error) },
      { status: 502 },
    );
  }
}
