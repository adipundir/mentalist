import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, fallback, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { activeChain } from "@/lib/network";
import { attestVerdict } from "@/lib/inco";
import { CASEBOOK } from "@/lib/casebook";

/**
 * The keeper: files everybody's verdict once a case has closed, then shuts the books.
 *
 * Left to themselves, a winner had to come back and send three transactions to collect money
 * they had already won, and a winner who never came back was simply not counted. This walks
 * every closed case and does that work for the whole room.
 *
 * It holds no power worth stealing. `resolveFor` verifies a covalidator signature over a
 * handle the contract itself stored, so this key cannot invent a winner, move a verdict
 * between players, or change a number. The worst a lost key does is stop the filing, and
 * players keep `unseal`/`resolve` to do it themselves. Nothing here is custodial and no
 * money moves through it: payouts are pulled by the winner, never pushed by this.
 *
 * Runs on a schedule from vercel.json, and is safe to call again at any point. Every step
 * is idempotent: an already-filed player is skipped by the batch, and a settled case is
 * skipped here.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STAKED = parseAbiItem(
  "event Staked(uint16 indexed caseId, address indexed player, uint256 amount, uint128 pot)",
);

function keeperAccount() {
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key) return null;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

/**
 * The last time an unauthenticated caller was allowed to start a run.
 *
 * The site nudges this endpoint when a player is sitting on a case that has closed, which is
 * the moment a late schedule actually shows, so the browser cannot be made to carry a secret
 * and the door has to be open. It cannot be made to lie, but it can be made to spend the
 * keeper's gas: a caller who hammers it during a filing window makes it send `unsealFor`
 * again and again for players the covalidator is not yet signing for. A cooldown is the whole
 * defence needed. It is per instance rather than shared, which only means a burst across
 * several cold starts gets through, and that costs one extra round of work, not a drain.
 */
let lastOpenRun = 0;
const OPEN_COOLDOWN_MS = 60_000;

export async function GET(request: Request) {
  const secret = process.env.KEEPER_SECRET;
  const auth = request.headers.get("authorization");
  // Vercel signs its own cron calls, and the GitHub schedule carries the secret. Both skip
  // the cooldown; a browser does not.
  const trusted =
    request.headers.get("x-vercel-cron") !== null || (!!secret && auth === `Bearer ${secret}`);
  if (!trusted) {
    const now = Date.now();
    if (now - lastOpenRun < OPEN_COOLDOWN_MS) {
      return NextResponse.json({ ok: true, skipped: "asked too recently" });
    }
    lastOpenRun = now;
  }

  const account = keeperAccount();
  if (!account) {
    return NextResponse.json({ error: "no keeper key configured" }, { status: 503 });
  }

  // Not the chain's default RPC. sepolia.base.org rate limits hard enough to fail a whole
  // run, and this one walks every case and reads a bet per entrant, so it is exactly the
  // caller that trips the limit. Ordered by how they have actually behaved, with the default
  // kept last so a bad day for one host is not a missed settlement.
  const transport = fallback([
    http("https://base-sepolia-rpc.publicnode.com"),
    http("https://base-sepolia.gateway.tenderly.co"),
    http("https://sepolia.base.org"),
  ]);
  const publicClient = createPublicClient({ chain: activeChain, transport });
  const wallet = createWalletClient({ account, chain: activeChain, transport });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const report: Record<string, unknown>[] = [];

  for (let caseId = 0; caseId < CASEBOOK.length; caseId++) {
    const step: Record<string, unknown> = { caseId };
    try {
      const c = (await publicClient.readContract({
        address: MENTALIST_ADDRESS,
        abi: MENTALIST_ABI,
        functionName: "cases",
        args: [caseId],
      })) as readonly [bigint, number, bigint, bigint, number, number, boolean, boolean];

      const [closesAt, , , , entrants, , settled, exists] = c;
      if (!exists || settled) continue;
      if (now < closesAt) {
        step.state = "still taking money";
        report.push(step);
        continue;
      }

      // Everyone who put money on this room. Reading it from the log rather than keeping a
      // list means the keeper has no state of its own to fall out of step with the chain.
      const staked = await publicClient.getLogs({
        address: MENTALIST_ADDRESS,
        event: STAKED,
        args: { caseId },
        fromBlock: 0n,
        toBlock: "latest",
      });
      const room = [...new Set(staked.map((l) => l.args.player as `0x${string}`))];
      step.entrants = Number(entrants);

      const unfiled: `0x${string}`[] = [];
      for (const player of room) {
        const bet = (await publicClient.readContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "bets",
          args: [caseId, player],
        })) as readonly [bigint, boolean, boolean, boolean];
        if (!bet[1]) unfiled.push(player);
      }

      const filingClosed = now >= closesAt + 600n; // FILING_WINDOW

      if (unfiled.length && !filingClosed) {
        // One transaction takes the keys to the whole room. Nothing is readable before the
        // close, which is what keeps this from being a machine for reading the answer early.
        const unsealHash = await wallet.writeContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "unsealFor",
          args: [caseId, unfiled],
          chain: activeChain,
          account,
        });
        await publicClient.waitForTransactionReceipt({ hash: unsealHash });

        const players: `0x${string}`[] = [];
        const attestations: { handle: `0x${string}`; value: `0x${string}` }[] = [];
        const signatures: `0x${string}`[][] = [];

        for (const player of unfiled) {
          const handle = (await publicClient.readContract({
            address: MENTALIST_ADDRESS,
            abi: MENTALIST_ABI,
            functionName: "verdictHandle",
            args: [caseId, player],
          })) as `0x${string}`;

          try {
            const v = await attestVerdict(wallet as never, handle);
            players.push(player);
            attestations.push(v.attestation);
            signatures.push(v.signatures);
          } catch (e) {
            // One player the covalidator will not sign for should not cost the rest of the
            // room its settlement. They keep the self-serve path, and the next run retries.
            step.skipped = [...((step.skipped as string[]) ?? []), player];
          }
        }

        if (players.length) {
          const hash = await wallet.writeContract({
            address: MENTALIST_ADDRESS,
            abi: MENTALIST_ABI,
            functionName: "resolveMany",
            args: [caseId, players, attestations, signatures],
            chain: activeChain,
            account,
          });
          await publicClient.waitForTransactionReceipt({ hash });
          step.filed = players.length;
        }
      }

      // The books can only shut once the filing window has run out, so that a slow filer is
      // never cut out of a win by a fast one.
      if (filingClosed) {
        const hash = await wallet.writeContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "settle",
          args: [caseId],
          chain: activeChain,
          account,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        step.settled = true;
      } else {
        step.state = step.filed ? "filed, waiting out the window" : "waiting out the window";
      }
    } catch (e) {
      step.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
    }
    report.push(step);
  }

  return NextResponse.json({ ok: true, cases: report });
}
