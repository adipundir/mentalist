/**
 * Attribution, pinned to the bottom of the screen.
 *
 * All four marks are the official assets: Inco's own wordmark keeps its blue, Base ships a
 * white lockup in its brand kit, USDC keeps Circle's blue, and Megapot's is near-black for
 * light backgrounds so it uses a bone variant, glyphs recoloured only, luminance mask
 * untouched, which is the standard monochrome treatment on a dark ground.
 */
const MARKS = [
  { href: "https://inco.org", src: "/brand/inco.svg", alt: "Inco", h: "h-[19px]" },
  { href: "https://megapot.io", src: "/brand/megapot-light.svg", alt: "Megapot", h: "h-[14px]" },
  { href: "https://base.org", src: "/brand/base.svg", alt: "Base", h: "h-[15px]" },
  // Circle ship the USDC glyph on its own, with no wordmark beside it, so next to three
  // lockups it read as a stray blue coin. The name is set alongside it to match them.
  {
    href: "https://www.circle.com/usdc",
    src: "/brand/usdc.svg",
    alt: "USDC",
    h: "h-[17px]",
    word: "USDC",
  },
] as const;

export function PoweredBy({
  className = "",
  fixed = false,
}: {
  className?: string;
  fixed?: boolean;
}) {
  return (
    <div
      className={[
        fixed ? "pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-6 pb-4 pt-8" : "",
        className,
      ].join(" ")}
      style={
        fixed
          ? { background: "linear-gradient(transparent, rgb(var(--ink) / 0.85) 55%)" }
          : undefined
      }
    >
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <span className="flex h-5 items-center font-mono text-[9px] tracking-file text-bone-dim/75">POWERED BY</span>
        {MARKS.map((m) => (
          <a
            key={m.alt}
            href={m.href}
            target="_blank"
            rel="noreferrer"
            aria-label={m.alt}
            className="flex h-5 items-center gap-1.5 opacity-60 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.src} alt={m.alt} className={`${m.h} w-auto shrink-0 self-center`} />
            {"word" in m && (
              <span className="font-type text-[15px] leading-none tracking-wide text-bone self-center">
                {m.word}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
