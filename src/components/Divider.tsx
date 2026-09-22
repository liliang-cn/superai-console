// A panel edge you can pull.
//
// Absolutely positioned over the grid rather than being a track in it: the
// same three numbers that build the template place this, so the handle is
// always exactly on the seam without anything being measured.
//
// It is 9px of target over a 1px line. A divider the width of the line it
// draws is a divider nobody can grab; the line stays hairline and the reach
// extends either side of it, which is why this sits on top rather than in the
// flow where it would push the panels apart.
export default function Divider({
  axis,
  at,
  onGrab,
  title,
}: {
  axis: "x" | "y";
  /** A CSS length for the seam: left for x, top for y. */
  at: string;
  onGrab: (e: React.PointerEvent<HTMLDivElement>) => void;
  title: string;
}) {
  const vertical = axis === "x";
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={title}
      title={title}
      onPointerDown={onGrab}
      className={
        vertical
          ? "group absolute top-0 bottom-0 z-20 w-[9px] -translate-x-1/2 cursor-col-resize touch-none"
          : "group absolute left-0 right-0 z-20 h-[9px] -translate-y-1/2 cursor-row-resize touch-none"
      }
      style={vertical ? { left: at } : { top: at }}
    >
      {/* The line itself, lit only while the cursor is on it — a console with
          three permanently glowing seams is three lines competing with the
          orb. */}
      <div
        className={
          vertical
            ? "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-sig-model/50"
            : "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors group-hover:bg-sig-model/50"
        }
      />
    </div>
  );
}
