import { useEffect, useState } from "react";
import type { PulseRun } from "../lib/api";

// What is being worked on right now.
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
    // Then once a second: the display is in seconds, so anything faster is
    // work nobody can see.
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
  return m < 60 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

export default function Tasks({ runs }: { runs: PulseRun[] }) {
  const now = useNow(runs.length > 0);

  if (runs.length === 0) {
    return (
      <p className="px-3 pb-3 font-mono text-[11px] leading-relaxed text-white/25">
        Idle. A turn appears here the moment one starts — what it is doing, which
        round it is on, and how long it has been on it.
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 pb-3">
      <ul className="space-y-3">
        {runs.map((r) => {
          // "waiting" is the gap between a model span and a tool span. It is a
          // real state and worth showing as one, rather than as a blank.
          const thinking = r.doing === "thinking";
          const waiting = r.doing === "waiting";
          return (
            <li key={r.runId} className="border-l border-white/10 pl-3">
              <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                <span
                  className={
                    thinking
                      ? "text-cyan-300/90"
                      : waiting
                        ? "text-white/35"
                        : "text-amber-300/90"
                  }
                >
                  {r.doing}
                </span>
                <span className="shrink-0 tabular-nums text-white/30">
                  round {r.round} · {elapsed(r.since, now)}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-white/25">
                {r.model}
                {r.session ? ` · ${r.session}` : ""}
              </div>
              {/* The tail of the reasoning in progress. It is the one thing on
                  this screen that says what the agent is actually thinking,
                  and it is a tail: it will cut off mid-word, which is correct.
                  Clamped to three lines so a long thought cannot push the
                  other runs off the panel. */}
              {r.think ? (
                <p className="mt-1.5 line-clamp-3 font-mono text-[11px] leading-relaxed text-white/45">
                  {r.think}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
