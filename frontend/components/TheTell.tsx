"use client";

import { useEffect, useState } from "react";
import type { CaseFile } from "@/lib/casebook";
import { person } from "@/lib/canon";
import { Character } from "./Character";

/**
 * The reasoning, fetched once a case is decided.
 *
 * Nothing here is in the bundle. The killer and the explanation live server side and
 * `/api/tell` will not release them until the chain says the case is settled, so a player
 * cannot read the answer out of the page before betting on it.
 */
export function TheTell({ caseId, chapter, settled }: { caseId: number; chapter: CaseFile; settled: boolean }) {
  const [tell, setTell] = useState<{ personId: number; name: string; alibi: string; tell: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!settled) return;
    let live = true;
    const cacheKey = `mentalist:settled-answer:${caseId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setTell(JSON.parse(cached) as { personId: number; name: string; alibi: string; tell: string });
        return () => {
          live = false;
        };
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    setLoading(true);
    setError(false);
    void fetch(`/api/tell?case=${caseId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("answer unavailable");
        return response.json();
      })
      .then((data) => {
        if (live && data?.name && Number.isInteger(data.personId)) {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
          setTell(data);
        } else if (live) throw new Error("answer unavailable");
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [caseId, settled]);

  if (!tell && error) {
    return settled ? (
      <div className="mt-6 border-l-2 border-blood/40 pl-4">
        <p className="font-mono text-[17px] tracking-file text-blood-hot sm:text-[20px]">CASE FILE UNAVAILABLE</p>
        <p className="mt-2 font-body text-[14px] text-bone-dim">The settled answer is not configured on the server.</p>
      </div>
    ) : null;
  }

  if (!tell) {
    return settled ? (
      <div className="mt-4 flex items-end gap-4 border-l-2 border-blood/40 pl-4">
        <div className="h-40 w-24 animate-pulse bg-ink-3/60 sm:h-48 sm:w-32" />
        <div className="flex-1 space-y-4 pb-2">
          <p className="font-mono text-[17px] tracking-file text-blood-hot sm:text-[20px]">OPENING CASE FILE…</p>
          <div className="h-4 w-2/3 animate-pulse bg-ink-3/60" />
          <div className="h-5 w-full animate-pulse bg-ink-3/60" />
          <div className="h-5 w-4/5 animate-pulse bg-ink-3/60" />
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="mt-4 grid gap-4 border-l-2 border-blood/60 pl-4 sm:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] sm:items-center sm:gap-6">
      <div className="mx-auto w-full max-w-[240px] border-2 border-ink-3 bg-[#211c1a]">
        <Character
          spec={{ ...person(chapter.roster[tell.personId]).character, id: chapter.roster[tell.personId] }}
          expression="shocked"
          fullBody
          className="h-52 w-full sm:h-[280px] lg:h-[300px]"
        />
      </div>
      <div className="min-w-0 pb-1">
      <p className="max-w-[34ch] font-mono text-[14px] tracking-file text-blood-hot sm:text-[16px]">
        RED JOHN WAS {tell.name}
      </p>
      <p className="mt-2 font-body text-[16px] italic leading-relaxed text-bone-dim sm:text-[18px]">
        &ldquo;{tell.alibi}&rdquo;
      </p>
      <p className="mt-2 font-body text-[15px] leading-relaxed text-bone sm:text-[16px]">{tell.tell}</p>
      </div>
    </div>
  );
}
