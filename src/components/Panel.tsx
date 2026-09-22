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
    <section className={`relative flex min-h-0 flex-col bg-black ${className}`}>
      <header className="flex h-[34px] shrink-0 items-center justify-between gap-3 px-4">
        <h2 className="text-[10px] font-semibold tracking-[0.2em] text-ink-2">{title}</h2>
        {note ? <div className="text-[10px] text-ink-3">{note}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

/** The empty state of a feed. Says what will appear, not that nothing has. */
export function Vacant({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[46ch] px-4 pb-4 text-xs leading-[1.7] text-ink-3">{children}</p>
  );
}
