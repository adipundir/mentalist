import type { CaseFile } from "@/lib/casebook";

/**
 * The reasoning, shown once a case is decided.
 *
 * Every room is one contradiction wearing a lot of furniture, and a player who staked and
 * lost deserves to see the thing they walked past rather than just the word WRONG. This
 * names the killer, quotes him back word for word, and says what could not be true about it.
 *
 * It renders only after the verdict is in. Before that it would be the answer key.
 */
export function TheTell({ chapter }: { chapter: CaseFile }) {
  const seat = chapter.alibis.findIndex((a) => a.impossible);
  if (seat < 0) return null;
  const name = chapter.roster[seat];

  return (
    <div className="mt-6 border-l-2 border-blood/60 pl-4">
      <p className="font-mono text-[10px] tracking-file text-blood-hot">RED JOHN WAS {name}</p>

      <p className="mt-3 font-body text-[15px] italic leading-relaxed text-bone-dim">
        &ldquo;{chapter.alibis[seat].text}&rdquo;
      </p>

      <p className="mt-3 font-body text-[15px] leading-relaxed text-bone">{chapter.tell}</p>
    </div>
  );
}
