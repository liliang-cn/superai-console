import type { CSSProperties, ReactNode } from "react";
import { Decode, Sweep } from "./Motion";

/**
 * One framed area.
 *
 * The panels are not boxes drawn on the ground — they are absences of it, a
 * hairline and a label, and the dot grid runs on under them. A card with a
 * background would make five rectangles competing with the one thing that is
 * meant to glow.
 *
 * On the first draw each panel boots: its top edge is drawn from the corner,
 * its title decodes, and what is in it rises into place — `index` staggers
 * them. After that, each time `ping` changes, a slug of light in `pingColor`
 * runs along the top edge: something just landed here.
 */
export default function Panel({
  title,
  note,
  children,
  className = "",
  index = 0,
  ping,
  pingColor,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Boot order, for the stagger. */
  index?: number;
  /** Anything that changes when an event lands in this panel. */
  ping?: unknown;
  /** The colour of what landed; the model's colour if not given. */
  pingColor?: string;
}) {
  const style = { "--i": index } as CSSProperties;
  return (
    <section className={`relative flex min-h-0 flex-col ${className}`} style={style}>
      <span className="panel-boot-line" aria-hidden="true" />
      {/* Corner ticks, a sight's brackets: they mark the panel without
          drawing a box, and flash with the sweep when something lands. */}
      <span className="panel-corner tl" aria-hidden="true" />
      <span className="panel-corner tr" aria-hidden="true" />
      <span className="panel-corner bl" aria-hidden="true" />
      <span className="panel-corner br" aria-hidden="true" />
      <Sweep on={ping} color={pingColor} />
      <header className="flex h-[34px] shrink-0 items-center justify-between gap-3 px-4">
        <h2 className="text-[10px] font-semibold tracking-[0.2em] text-ink-2">
          <Decode text={title} delay={index * 110 + 120} step={38} />
        </h2>
        {note ? <div className="text-[10px] text-ink-3">{note}</div> : null}
      </header>
      <div className="panel-boot-body min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

/** The empty state of a feed. Says what will appear, not that nothing has. */
export function Vacant({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[46ch] px-4 pb-4 text-xs leading-[1.7] text-ink-3">{children}</p>
  );
}
