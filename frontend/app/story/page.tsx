"use client";

import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, usePublicClient } from "wagmi";
import { CASEBOOK } from "@/lib/casebook";
import { lineup, person } from "@/lib/canon";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { Scene } from "@/components/Scene";
import { StoryCard } from "@/components/StoryCard";
import { Settlement } from "@/components/Settlement";
import { TheTell } from "@/components/TheTell";
import { Stake } from "@/components/Stake";

type Stage = "opening" | "playing" | "closing";

interface CaseRow {
  /** Unix ms the contract stops taking money. */
  closesAt: number;
  pot: bigint;
  entrants: number;
  /** Open on chain, not settled, and still inside its window. */
  open: boolean;
}

/**
 * THE RED JOHN CASES, the game.
 *
 * Seven cases following the real arc, the lineup shrinking the way the suspect list does.
 *
 * The room costs nothing. You open a case, you hear every account in it, and you decide,
 * with no wallet connected and nothing signed: the accounts are public data and the deal
 * that hands them out is a public function. The chain enters the story exactly once, when
 * you put money on a name, and that name goes out encrypted so nobody can trade on it.
 * Afterwards the contract rules on the verdict against an Inco attestation, and the winners
 * take the pot as real Megapot tickets.
 */
function StoryInner() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = Number(params.get("case") ?? 0);
  const [index, setIndex] = useState(
    Number.isInteger(requested) && requested >= 0 && requested < CASEBOOK.length ? requested : 0,
  );
  const [stage, setStage] = useState<Stage | null>(null);
  /** The opening stage is decided once, not on every poll. */
  const settled = useRef(false);
  /** Null until the contract has ruled. Nobody can know it while the case is still open. */
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [pick, setPick] = useState<{ seat: number; name: string } | null>(null);
  const [row, setRow] = useState<CaseRow | null>(null);
  /** True while the stake is on the wire, so the room cannot re-point a bet already sent. */
  const [locked, setLocked] = useState(false);

  const pub = usePublicClient();
  const { address } = useAccount();

  const chapter = CASEBOOK[index];
  const suspects = useMemo(() => lineup(chapter.roster), [chapter]);

  useEffect(() => {
    setPick(null);
    setVerdict(null);
    setRow(null);
    // Keyed on the account too. A verdict belongs to one wallet, and leaving it up through a
    // switch showed the new account the old one's outcome, with the killer named underneath.
    // The stage has to be re-decided as well, or the new account keeps the old one's room.
    settled.current = false;
    setStage(null);
  }, [index, address]);

  // The pot and the clock, read straight from the contract. A read needs no wallet and no
  // signature, and the alternative is a countdown the frontend invented, which would
  // eventually promise a player a window the contract will not honour.
  useEffect(() => {
    if (!pub) return;
    let live = true;
    const read = async () => {
      try {
        const c = await pub.readContract({
          address: MENTALIST_ADDRESS,
          abi: MENTALIST_ABI,
          functionName: "cases",
          args: [index],
        });
        if (!live) return;
        const closesAt = Number(c[0]) * 1000;
        setRow({
          closesAt,
          pot: c[2],
          entrants: Number(c[4]),
          open: c[7] && !c[6] && Date.now() < closesAt,
        });

        // Somebody coming back to a case they already backed should land on the settlement,
        // not be made to walk the room again to reach it.
        //
        // This decides the opening stage once and then leaves it alone. The read repeats on
        // a timer for the pot and the clock, and letting it keep writing the stage would
        // throw a player out of the room every fifteen seconds.
        if (!settled.current) {
          const staked = address
            ? await pub.readContract({
                address: MENTALIST_ADDRESS,
                abi: MENTALIST_ABI,
                functionName: "hasStaked",
                args: [index, address],
              })
            : false;
          if (live) {
            settled.current = true;
            setStage(staked ? "closing" : "opening");
          }
        }
      } catch (err) {
        // A failed read must not leave the page blank forever. Show the briefing: the room
        // is playable without a chain, and the stake panel reports the trouble on its own.
        if (live && !settled.current) {
          settled.current = true;
          setStage("opening");
        }
      }
    };
    void read();
    const id = setInterval(read, 15_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pub, index, address]);

  // `open` is a snapshot taken by a poll that runs every fifteen seconds, and the clock in the
  // HUD is live, so between the clock reaching zero and the next read the panel would still
  // offer a stake the contract now rejects. That costs a real approve transaction and a stake
  // that reverts, so retire it on the same edge the clock does.
  useEffect(() => {
    if (!row?.open) return;
    const ms = row.closesAt - Date.now();
    const close = () => setRow((r) => (r ? { ...r, open: false } : r));
    if (ms <= 0) return close();
    // A delay past 2^31-1 ms fires immediately, and nothing bounds how long a case may be
    // opened for.
    const id = setTimeout(close, Math.min(ms, 2_147_483_000));
    return () => clearTimeout(id);
  }, [row?.open, row?.closesAt]);

  function advance() {
    // Every case is its own murder with its own killer, so there is no arc to carry a win
    // forward into. Whatever happened here, the next thing is the board.
    router.push("/cases");
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* The masthead rides on top of the room rather than above it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex flex-wrap items-center gap-3 px-4 pb-6 pt-4 sm:px-7"
      >
        <Link href="/cases" className="pointer-events-auto font-type text-[15px] tracking-wide text-bone hover:text-blood-hot">
          MENTALIST
        </Link>
        <span className="text-bone-dim">/</span>
        <span className="font-mono text-[10px] tracking-file text-blood-hot">THE RED JOHN CASES</span>

        <ol className="ml-1 flex flex-wrap items-center gap-1">
          {CASEBOOK.map((c, i) => (
            <li
              key={c.title}
              title={`${c.label}, ${c.title}`}
              className={[
                "h-1.5 w-6 border",
                i < index ? "border-brass bg-brass" : i === index ? "border-blood-hot bg-blood-hot" : "border-ink-3",
              ].join(" ")}
            />
          ))}
        </ol>

      </div>

      <Scene
        key={index}
        suspects={suspects}
        alibis={chapter.alibis}
        title={chapter.title}
        chapter={`CASE ${index + 1} OF ${CASEBOOK.length}`}
        nudge={{
          name: person(chapter.nudge.speaker).name,
          spec: { ...person(chapter.nudge.speaker).character, id: chapter.nudge.speaker },
          line: chapter.nudge.line,
        }}
        closesAt={row?.closesAt}
        variant={index}
        locked={locked}
        onPick={(seat, name) => setPick(seat === null || name === null ? null : { seat, name })}
        stakePanel={
          <Stake
            caseId={index}
            seat={pick?.seat ?? null}
            naming={pick?.name ?? null}
            pot={row?.pot ?? null}
            entrants={row?.entrants ?? null}
            open={row?.open ?? null}
            onBusy={setLocked}
            onStaked={() => setStage("closing")}
          />
        }
      />

      <AnimatePresence>
        {stage === "opening" && (
          <StoryCard
            key={`open-${index}`}
            chapter={`CASE ${index + 1} OF ${CASEBOOK.length}, ${chapter.suspects} SUSPECTS, ${chapter.liars} OF THEM LYING`}
            title={chapter.title}
            body={chapter.opening}
            onContinue={() => setStage("playing")}
            continueLabel="WORK THE ROOM"
          />
        )}

        {stage === "closing" && (
          <StoryCard
            key={`close-${index}`}
            chapter={verdict === null ? "THE MONEY IS DOWN" : verdict ? "CASE CLOSED" : "HE WALKED"}
            title={chapter.title}
            body={
              verdict === null
                ? "Your money is on a name nobody else can read, and it stays that way until the case closes. Nobody can watch what you did and copy it, and nobody, including whoever wrote this case, can move the answer now that there is money against it."
                : verdict
                  ? chapter.successText
                  : chapter.failureText
            }
            onContinue={advance}
            continueLabel="BACK TO THE CASES"
            extra={
              <>
                {/* The verdict on its own is a scoreboard. Once the case is decided the room
                    is over, so the reasoning is no longer worth withholding: name the man,
                    put his own words back in front of the player, and show the contradiction
                    that was sitting in them the whole time. */}
                {verdict !== null && <TheTell chapter={chapter} />}
                <Settlement caseId={index} onResolved={setVerdict} />
              </>
            }
          />
        )}
      </AnimatePresence>
    </main>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={<p className="p-8 font-mono text-[11px] tracking-file text-bone-dim">PULLING THE FILE…</p>}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <StoryInner />
      </motion.div>
    </Suspense>
  );
}
