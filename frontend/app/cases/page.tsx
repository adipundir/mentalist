"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAccount, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CASEBOOK } from "@/lib/casebook";
import { lineup } from "@/lib/canon";
import { MENTALIST_ABI, MENTALIST_ADDRESS } from "@/lib/contracts";
import { usdc } from "@/lib/market";
import { SEASON_START, countdown, nextRelease, schedule } from "@/lib/schedule";
import { Character } from "@/components/Character";
import { PoweredBy } from "@/components/PoweredBy";

/**
 * THE BOARD.
 *
 * Every case, what it is worth, and whether you have had your go at it. One file a day,
 * and each stays open until its round closes, so the board fills up over the week rather
 * than handing you all seven at once.
 *
 * Pot and entrant counts are read live from the market. A case with real money on it should
 * look different from one nobody has touched, because it is.
 */

/** The three edges the key art dissolves through, composited down to their intersection. */
const JANE_MASK = [
  "linear-gradient(to left, #000 42%, transparent 96%)",
  "linear-gradient(to bottom, #000 72%, transparent 100%)",
  "linear-gradient(to top, #000 94%, transparent 100%)",
].join(", ");

interface Row {
  pot: bigint;
  entrants: number;
  closesAt: number;
  settled: boolean;
  /** This wallet already has money on this case. */
  played: boolean;
}

export default function Board() {
  const { address } = useAccount();
  const pub = usePublicClient();
  const [rows, setRows] = useState<Record<number, Row>>({});
  // Starts at the season epoch rather than at Date.now(): a clock read during render does
  // not survive hydration, because the server read it a moment earlier than the browser did.
  const [now, setNow] = useState(SEASON_START);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pub) return;
    let live = true;
    const read = async () => {
      const out: Record<number, Row> = {};
      await Promise.all(
        CASEBOOK.map(async (_, i) => {
          try {
            const c = await pub.readContract({
              address: MENTALIST_ADDRESS,
              abi: MENTALIST_ABI,
              functionName: "cases",
              args: [i],
            });
            let played = false;
            if (address) {
              played = await pub.readContract({
                address: MENTALIST_ADDRESS,
                abi: MENTALIST_ABI,
                functionName: "hasStaked",
                args: [i, address],
              });
            }
            out[i] = {
              pot: c[2],
              entrants: Number(c[4]),
              closesAt: Number(c[0]) * 1000,
              settled: c[6],
              played,
            };
          } catch {
            /* a cold read just leaves the row unknown */
          }
        }),
      );
      if (live) setRows(out);
    };
    void read();
    const id = setInterval(read, 15_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pub, address]);

  const releases = useMemo(() => schedule(now), [now]);
  const next = useMemo(() => nextRelease(now), [now]);

  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-32 pt-6 sm:px-8">
      {/* The face of the show.
          Key art standing on the bottom edge of the window and running off the right of it,
          the way a series presents itself on a streaming front page: cropped by the frame
          rather than sitting in a box, lit from the side it faces, graded down until it is
          scenery for the type instead of competition for it. Fixed, not absolute — it is the
          backdrop the board scrolls over, and a backdrop that slides away is just a picture.
          Held back on small screens, where there is no room to be anything but in the way. */}
      <div
        className="pointer-events-none fixed right-0 top-0 z-0 hidden h-dvh w-[min(62vw,820px)] select-none overflow-hidden md:block"
        aria-hidden
      >
        {/* the light he is standing in */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(52% 46% at 72% 30%, rgb(var(--blood) / 0.2) 0%, transparent 72%)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/jane.png"
          alt=""
          draggable={false}
          className="absolute right-0 top-0 h-full w-auto max-w-none object-contain object-top"
          style={{
            // Three fades at once — off the left into the text, off the bottom into the
            // board, and a touch off the top so his hair does not butt against the window
            // edge. `intersect` is what stops them cancelling out into an opaque rectangle.
            maskImage: JANE_MASK,
            WebkitMaskImage: JANE_MASK,
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
            filter: "grayscale(0.4) contrast(1.06) brightness(0.8) sepia(0.14)",
          }}
        />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-3">
        <Link href="/" className="font-type text-[15px] tracking-wide text-bone hover:text-blood-hot">
          MENTALIST
        </Link>
        <span className="text-bone-dim">/</span>
        <span className="font-mono text-[10px] tracking-file text-blood-hot">THE RED JOHN CASES</span>
        <div className="ml-auto flex items-center gap-3">
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-8 w-full max-w-[1100px]">
        <h1 className="font-type text-[30px] leading-tight text-bone sm:text-[38px]">
          Find Red John.
        </h1>
        <p className="mt-2 max-w-[620px] font-body text-[16px] leading-relaxed text-bone-dim">
          Every room has a killer in it, and every one of them signs the work the same way: a
          smiling face, drawn in the victim&rsquo;s blood. Red John is the name that signature
          goes by. Finding him is the whole job. Everyone in the room gives an account of where
          they were.{" "}
          <span className="text-bone">One account cannot be true</span>, and that is your man.
          Back him with money and you take a share of everything the people who were wrong put
          in, paid as <span className="text-brass">Megapot tickets</span>.
        </p>
        {next && (
          <p className="mt-3 font-mono text-[10px] tracking-file text-bone-dim">
            NEXT FILE IN <span className="text-blood-hot">{countdown(next.until)}</span>
          </p>
        )}
      </div>

      <ol className="relative z-10 mx-auto mt-8 grid w-full max-w-[1100px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CASEBOOK.map((c, i) => {
          const rel = releases[i]!;
          const row = rows[i];
          const closed = row ? now >= row.closesAt : false;
          const open = rel.released && !closed && !row?.settled;

          return (
            <motion.li
              key={c.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
            >
              <CaseCard
                index={i}
                title={c.title}
                label={c.label}
                blurb={c.blurb}
                setting={c.setting}
                suspects={c.suspects}
                roster={c.roster}
                released={rel.released}
                until={rel.until}
                open={open}
                row={row}
                now={now}
              />
            </motion.li>
          );
        })}
      </ol>

      {/* At the foot of the board rather than pinned to the viewport: it is a credit,
          not a HUD, and it was covering the cases it is meant to be underneath. */}
      <PoweredBy className="relative z-10 mx-auto mt-16 w-full max-w-[1100px]" />
    </main>
  );
}

function CaseCard({
  index,
  title,
  label,
  blurb,
  setting,
  suspects,
  roster,
  released,
  until,
  open,
  row,
  now,
}: {
  index: number;
  title: string;
  label: string;
  blurb: string;
  setting: string;
  suspects: number;
  roster: string[];
  released: boolean;
  until: number;
  open: boolean;
  row?: Row;
  now: number;
}) {
  const faces = useMemo(() => lineup(roster).slice(0, 5), [roster]);
  const left = row ? Math.max(0, row.closesAt - now) : 0;

  const body = (
    <div
      className={[
        "group relative flex h-full flex-col border p-4 transition-colors",
        released
          ? "border-ink-3 bg-ink-2 hover:border-blood-hot/60"
          : "border-ink-3 bg-ink-2/40",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] tracking-file text-blood-hot">{label}</p>
        {row?.played ? (
          <span className="border border-brass px-1.5 py-0.5 font-mono text-[8px] tracking-file text-brass">
            YOU PLAYED
          </span>
        ) : !released ? (
          <span className="font-mono text-[9px] tracking-file text-bone-dim">
            OPENS IN {countdown(until)}
          </span>
        ) : open ? (
          <span className="font-mono text-[9px] tracking-file text-bone-dim">
            {left > 0 ? `CLOSES IN ${countdown(left)}` : "CLOSING"}
          </span>
        ) : (
          <span className="font-mono text-[9px] tracking-file text-bone-dim">CLOSED</span>
        )}
      </div>

      <h2
        className={`mt-1 font-type text-[21px] leading-tight ${released ? "text-bone" : "text-bone-dim"}`}
      >
        {title}
      </h2>
      <p className="mt-1 min-h-[38px] font-body text-[13px] leading-snug text-bone-dim">{blurb}</p>
      <p className="mt-1 font-mono text-[9px] tracking-file text-bone-dim/75">
        {setting.toUpperCase()}
      </p>

      {/* The room on the left, what it is worth on the right.
          The count that used to sit here said "4 IN THE ROOM" beside four faces you can
          already see and count, which is the same fact twice and the less legible of the two.
          The faces do that job on their own. */}
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-ink-3 pt-3">
        <div className="flex -space-x-1.5">
          {faces.map((s) => (
            <div
              key={s.seat}
              className="h-9 w-8 shrink-0 border border-ink-3 bg-[#211c1a]"
              style={{ filter: released ? undefined : "grayscale(1) brightness(0.6)" }}
            >
              <Character spec={s.character} expression="neutral" className="h-full w-full" />
            </div>
          ))}
          {suspects > faces.length && (
            <div className="flex h-9 w-8 shrink-0 items-center justify-center border border-ink-3 bg-ink font-mono text-[9px] text-bone-dim">
              +{suspects - faces.length}
            </div>
          )}
        </div>

        <div className="text-right">
          <p className="mb-1.5 font-mono text-[9px] tracking-file text-bone-dim">IN THE POT</p>
          <p className="font-type text-[19px] leading-none text-brass">
            ${row ? usdc(row.pot) : "0.00"}
          </p>
        </div>
      </div>
    </div>
  );

  if (!released) return <div className="h-full cursor-not-allowed opacity-60">{body}</div>;
  return (
    <Link href={`/story?case=${index}`} className="block h-full">
      {body}
    </Link>
  );
}
