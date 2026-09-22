import { useEffect, useRef } from "react";
import type { PulseEvent } from "../lib/api";

// Everything going in and out of the model.
//
// The same stream the memory panel filters, unfiltered: model turns with their
// token counts, tool calls with their durations, reasoning as it is written,
// errors, and compactions. Kinds are coloured rather than labelled — a column
// of the word "tool" repeated forty times carries no information, and the eye
// reads the colour faster than it would read the word.

const KIND: Record<string, { dot: string; text: string }> = {
  model: { dot: "bg-cyan-300/70", text: "text-cyan-100/70" },
  think: { dot: "bg-indigo-300/50", text: "text-indigo-100/45" },
  tool: { dot: "bg-amber-300/70", text: "text-amber-100/65" },
  error: { dot: "bg-rose-400/80", text: "text-rose-200/80" },
  compact: { dot: "bg-white/30", text: "text-white/35" },
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
    return (
      <p className="px-3 pb-3 font-mono text-[11px] leading-relaxed text-white/25">
        Quiet. Model turns, tool calls and reasoning appear here as they happen.
      </p>
    );
  }

  return (
    <div ref={boxRef} className="h-full overflow-y-auto px-3 pb-3">
      <ol className="space-y-[3px] font-mono text-[11px]">
        {events.map((e) => {
          const k = KIND[e.kind] ?? KIND.compact;
          return (
            <li key={e.seq} className="flex items-baseline gap-2">
              <span className="w-[52px] shrink-0 tabular-nums text-white/20">
                {e.at.slice(11, 19)}
              </span>
              <span
                className={`mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full ${e.bad ? KIND.error.dot : k.dot}`}
              />
              {/* An inner call is a sub-agent's, and indenting it is the only
                  thing that distinguishes forty tool calls made by one worker
                  from forty made by the main loop. */}
              <span
                className={`min-w-0 flex-1 truncate ${e.bad ? KIND.error.text : k.text} ${e.inner ? "pl-3" : ""}`}
                title={`${e.name}${e.text ? " · " + e.text : ""}`}
              >
                {e.name}
                {e.text ? <span className="text-white/25"> {e.text}</span> : null}
              </span>
              {e.n ? (
                <span className="shrink-0 tabular-nums text-white/30">{e.n}t</span>
              ) : null}
              {e.ms ? (
                <span className="shrink-0 tabular-nums text-white/20">{e.ms}ms</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
