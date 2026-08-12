/**
 * Attribution, with the real marks.
 *
 * Inco's wordmark keeps its own blue; Megapot's ships near-black for light backgrounds, so
 * a bone-coloured variant is used here — the standard monochrome treatment for a dark
 * ground, glyphs only, mask untouched.
 */
export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-7 gap-y-3 ${className}`}>
      <span className="font-mono text-[9px] tracking-file text-bone-dim/50">POWERED BY</span>

      <a
        href="https://inco.org"
        target="_blank"
        rel="noreferrer"
        aria-label="Inco"
        className="opacity-70 transition-opacity hover:opacity-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/inco.svg" alt="Inco" className="h-5 w-auto" />
      </a>

      <a
        href="https://megapot.io"
        target="_blank"
        rel="noreferrer"
        aria-label="Megapot"
        className="opacity-70 transition-opacity hover:opacity-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/megapot-light.svg" alt="Megapot" className="h-[15px] w-auto" />
      </a>

      <span className="font-mono text-[9px] tracking-file text-bone-dim/50">ON BASE SEPOLIA</span>
    </div>
  );
}
