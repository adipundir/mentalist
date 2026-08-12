/**
 * Attribution, pinned to the bottom of the screen.
 *
 * All three marks are the official assets: Inco's own wordmark keeps its blue, Base ships a
 * white lockup in its brand kit, and Megapot's is near-black for light backgrounds so it
 * uses a bone variant — glyphs recoloured only, luminance mask untouched, which is the
 * standard monochrome treatment on a dark ground.
 */
const MARKS = [
  { href: "https://inco.org", src: "/brand/inco.svg", alt: "Inco", h: "h-[19px]" },
  { href: "https://megapot.io", src: "/brand/megapot-light.svg", alt: "Megapot", h: "h-[14px]" },
  { href: "https://base.org", src: "/brand/base.svg", alt: "Base", h: "h-[15px]" },
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
        <span className="font-mono text-[9px] tracking-file text-bone-dim/45">POWERED BY</span>
        {MARKS.map((m) => (
          <a
            key={m.alt}
            href={m.href}
            target="_blank"
            rel="noreferrer"
            aria-label={m.alt}
            className="opacity-60 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.src} alt={m.alt} className={`${m.h} w-auto`} />
          </a>
        ))}
      </div>
    </div>
  );
}
