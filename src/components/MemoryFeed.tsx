import { useEffect, useRef } from "react";
import type { PulseEvent } from "../lib/api";
import { Vacant } from "./Panel";

// What the brain just did.
//
// Every memory tool the agent called, newest last, with how long it took. The
// point of a separate panel rather than a filter on the main feed is that
// these are the events you cannot see any other way: a remember that fired is
// invisible until you go looking in the store, and a widening query — city,
// then address, then home — is the agent not finding it the first time, which
// no transcript records.

/** Shortens memory_search -> search, knowledge_memory_recall -> recall. The
 *  prefixes are all the same and the suffix is the verb. */
function verb(name: string): string {
  const parts = name.split(/[_.]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-1)[0] : name;
}

/** Reads are one colour and writes another, because the two are not the same
 *  event: one is the agent consulting itself, the other is it changing what it
 *  will believe tomorrow. */
function tone(name: string, bad?: boolean): string {
  if (bad) return "text-sig-bad";
  const n = name.toLowerCase();
  if (n.includes("remember") || n.includes("save") || n.includes("upsert") || n.includes("write"))
    return "text-sig-tool";
  return "text-sig-model";
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
      <Vacant>Reads and writes to memory appear here as they happen.</Vacant>
    );
  }

  return (
    <div ref={boxRef} className="h-full overflow-y-auto px-4 pb-4">
      <ol className="space-y-[5px] text-xs">
        {events.map((e) => (
          <li key={e.seq} className="arrive flex items-baseline gap-2.5">
            <span className="w-[56px] shrink-0 text-ink-3">{e.at.slice(11, 19)}</span>
            <span className={`shrink-0 ${tone(e.name, e.bad)}`} title={e.name}>
              {verb(e.name)}
            </span>
            {e.text ? (
              <span className="min-w-0 flex-1 truncate text-ink-2" title={e.text}>
                {e.text}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {e.bad ? (
              <span className="shrink-0 text-sig-bad">failed</span>
            ) : e.ms ? (
              <span className="shrink-0 text-ink-3">{e.ms}ms</span>
            ) : null}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
