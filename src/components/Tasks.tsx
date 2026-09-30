import { useEffect, useState } from "react";
import type { Meter, PulseRun } from "../lib/api";
import { Vacant } from "./Panel";

// What is being worked on right now.
//
// This is the one panel that is about *now*, so it is the one panel allowed
// weight: a lit rule down its side, a state in type large enough to read from
// across a desk, and room for the sentence the model is in the middle of
// writing. The feeds beside it stay small — they are a record, and a record
// can wait.
//
// A run's elapsed time is counted here rather than being sent: the backend
// hands over when the current step started (PulseRun.since) precisely so the
// page can run its own clock instead of being told the same number sixty
// times a minute. This is that clock.

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Read the clock before waiting a second for the first tick. Without this
    // the first frame of a new run compares its start time against whenever
    // this component happened to mount — which is earlier, so the elapsed time
    // is negative and the panel shows a dash for a second at exactly the
    // moment someone is watching to see that something started.
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function elapsed(sinceISO: string, now: number): string {
  const ms = now - new Date(sinceISO).getTime();
  if (!Number.isFinite(ms)) return "—";
  // A step that started a moment ago can read as slightly negative when this
  // machine's clock trails the agent's. That is zero seconds, not unknown.
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60
    ? `${m}m${String(s % 60).padStart(2, "0")}s`
    : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

/** "waiting" is the gap between a model span and a tool span. It is a real
 *  state and worth showing as one, rather than as a blank. */
function doingTone(doing: string): string {
  if (doing === "thinking") return "text-sig-model";
  if (doing === "waiting") return "text-ink-3";
  return "text-sig-tool";
}

export default function Tasks({ runs, meter }: { runs: PulseRun[]; meter: Meter | null }) {
  const now = useNow(runs.length > 0);

  if (runs.length === 0) {
    return (
      <Vacant>
        Idle. A turn appears the moment one starts — what it is doing, which round it
        is on, and how long it has been on it.
      </Vacant>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-4">
      <ul className="space-y-5">
        {runs.map((r) => (
          <li key={r.runId} className="arrive border-l-2 border-sig-model pl-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-[15px] ${doingTone(r.doing)}`}>{r.doing}</span>
              <span className="shrink-0 text-xs text-ink-2">
                round {r.round} · {elapsed(r.since, now)}
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-ink-3">
              {r.model}
              {r.session ? ` · ${r.session}` : ""}
            </div>
            {/* The tail of the reasoning in progress — the one thing on this
                screen that says what the agent is actually thinking. It is a
                tail: it will cut off mid-word, which is correct. Clamped so a
                long thought cannot push a second run off the panel. */}
            {r.think ? (
              <p className="mt-3.5 line-clamp-4 text-xs leading-[1.75] text-ink-1">{r.think}</p>
            ) : null}
            {meter ? (
              <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-3">
                <span>{meter.rounds} rounds</span>
                <span>{meter.calls} calls</span>
                <span>{meter.memory} memory</span>
                <span className={meter.fails ? "text-sig-bad" : undefined}>
                  {meter.fails} failed
                </span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
