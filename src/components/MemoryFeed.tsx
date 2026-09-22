import { useEffect, useRef } from "react";
import type { PulseEvent } from "../lib/api";

// What the brain just did.
//
// Every memory tool the agent called, newest last, with how long it took. The
// point of a separate panel rather than a filter on the main feed is that
// these are the events you cannot see any other way: a recall that found
// nothing looks exactly like no recall at all in the transcript, and a
// remember that fired is invisible until you go looking in the store.

/** Shortens memory_search -> search, knowledge_memory_recall -> recall. The
 *  prefixes are all the same and the suffix is the verb. */
function verb(name: string): string {
  const parts = name.split(/[_.]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-1)[0] : name;
}

function tone(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("remember") || n.includes("save") || n.includes("upsert")) return "text-amber-300/80";
  if (n.includes("recall") || n.includes("search") || n.includes("query")) return "text-cyan-300/80";
  return "text-white/55";
}

export default function MemoryFeed({ events }: { events: PulseEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Follow the tail, but only while the tail is what is being read. Scrolling
  // up to look at something and being yanked back down by the next event is
  // the fastest way to make a live feed unusable.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [events]);

  if (events.length === 0) {
    return (
      <p className="px-3 pb-3 font-mono text-[11px] leading-relaxed text-white/25">
        Nothing yet. Every recall, search and remember the agent makes shows up here
        as it happens.
      </p>
    );
  }

  return (
    <div ref={boxRef} className="h-full overflow-y-auto px-3 pb-3">
      <ol className="space-y-[3px] font-mono text-[11px]">
        {events.map((e) => (
          <li key={e.seq} className="flex items-baseline gap-2 tabular-nums">
            <span className="w-[52px] shrink-0 text-white/20">
              {e.at.slice(11, 19)}
            </span>
            <span className={`truncate ${tone(e.name)}`} title={e.name}>
              {verb(e.name)}
            </span>
            {e.text ? (
              <span className="min-w-0 flex-1 truncate text-white/30" title={e.text}>
                {e.text}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {e.ms ? (
              <span className="shrink-0 text-white/25">{e.ms}ms</span>
            ) : null}
            {e.bad ? <span className="shrink-0 text-rose-400/80">failed</span> : null}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
