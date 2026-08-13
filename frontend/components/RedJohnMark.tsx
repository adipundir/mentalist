/**
 * His signature.
 *
 * One file, every place the mark appears — the wall behind the title, the cold open, the
 * face of a suspect at the moment he stops pretending. It used to be drawn in SVG at each
 * of those sizes, three near-copies of the same face that could drift apart; a photograph
 * of the real thing carries the brush texture and the runs that a path never will, and it
 * only has to be right once.
 */
export function RedJohnMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    // Decorative everywhere it is used: the pages around it already say whose mark this is,
    // and a screen reader announcing "smiley face" over a murder board helps nobody.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/redjohn.png"
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={style}
    />
  );
}
