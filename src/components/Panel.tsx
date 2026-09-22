import type { ReactNode } from "react";

/**
 * One framed area.
 *
 * The console is black and the panels are not boxes drawn on it — they are
 * absences of black, a hairline and a label. A card with a background would
 * make five rectangles competing with the one thing that is meant to glow.
 */
export default function Panel({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative flex min-h-0 flex-col border border-white/8 bg-white/[0.015] ${className}`}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3 px-3 py-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          {title}
        </h2>
        {note ? <div className="font-mono text-[10px] text-white/30">{note}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
