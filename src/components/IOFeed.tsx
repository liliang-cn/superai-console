import { useEffect, useRef } from "react";
import type { PulseEvent } from "../lib/api";
import { Vacant } from "./Panel";

// Everything going in and out of the model.
//
// The same stream the memory panel filters, unfiltered: model turns with their
// token counts, tool calls with their durations, reasoning as it is written,
// errors, and compactions. Kinds are coloured rather than labelled — a column
// of the word "tool" repeated forty times carries no information, and the eye
// reads the colour faster than it would read the word.

const KIND: Record<string, { dot: string; text: string }> = {
  model: { dot: "bg-sig-model", text: "text-sig-model" },
  think: { dot: "bg-sig-think", text: "text-sig-think" },
  tool: { dot: "bg-sig-tool", text: "text-sig-tool" },
  error: { dot: "bg-sig-bad", text: "text-sig-bad" },
  compact: { dot: "bg-ink-3", text: "text-ink-2" },
};

export default function IOFeed({ events }: { events: PulseEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [events]);

  if (events.length === 0) {
    return <Vacant>Quiet. Model turns, tool calls and reasoning appear here as they happen.</Vacant>;
  }

  return (
    <div ref={boxRef} className="h-full overflow-y-auto px-4 pb-4">
      <ol className="space-y-[5px] text-xs">
        {events.map((e) => {
          const k = KIND[e.kind] ?? KIND.compact;
          return (
            <li key={e.seq} className="flex items-baseline gap-2.5">
              <span className="w-[56px] shrink-0 text-ink-3">{e.at.slice(11, 19)}</span>
              <span
                className={`mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full ${e.bad ? KIND.error.dot : k.dot}`}
              />
              {/* An inner call is a sub-agent's, and indenting it is the only
                  thing that distinguishes forty tool calls made by one worker
                  from forty made by the main loop. */}
              <span
                className={`min-w-0 flex-1 truncate ${e.bad ? KIND.error.text : k.text} ${e.inner ? "pl-3.5" : ""}`}
                title={`${e.name}${e.text ? " · " + e.text : ""}`}
              >
                {e.name}
                {e.text ? <span className="text-ink-3"> {e.text}</span> : null}
              </span>
              {/* Tokens read brighter than durations: what a turn cost is the
                  number worth scanning down the column. */}
              {e.n ? <span className="shrink-0 text-ink-2">{e.n.toLocaleString()}t</span> : null}
              {e.ms ? <span className="shrink-0 text-ink-3">{e.ms}ms</span> : null}
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
