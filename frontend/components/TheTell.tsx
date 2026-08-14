"use client";

import { useEffect, useState } from "react";
import type { CaseFile } from "@/lib/casebook";

/**
 * The reasoning, fetched once a case is decided.
 *
 * Nothing here is in the bundle. The killer and the explanation live server side and
 * `/api/tell` will not release them until the chain says the case is settled, so a player
 * cannot read the answer out of the page before betting on it.
 */
export function TheTell({ caseId, chapter }: { caseId: number; chapter: CaseFile }) {
  const [tell, setTell] = useState<{ name: string; alibi: string; tell: string } | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/tell?case=${caseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d?.name) setTell(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [caseId]);

  if (!tell) return null;

  return (
    <div className="mt-6 border-l-2 border-blood/60 pl-4">
      <p className="font-mono text-[10px] tracking-file text-blood-hot">
        RED JOHN WAS {tell.name}
      </p>
      <p className="mt-3 font-body text-[15px] italic leading-relaxed text-bone-dim">
        &ldquo;{tell.alibi}&rdquo;
      </p>
      <p className="mt-3 font-body text-[15px] leading-relaxed text-bone">{tell.tell}</p>
    </div>
  );
}
