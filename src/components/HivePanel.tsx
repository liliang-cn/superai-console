import { useEffect, useState } from "react";
import HiveStageView from "./HiveStageView";
import type { useHive } from "../lib/hive";
import { Vacant } from "./Panel";

// The hive on the console: the stage, and under it the orders as a list.
//
// The stage is what to look at from across the room — light travelling between
// a queen and her workers says the hive is busy without anyone reading it. The
// list is for the one moment you want to know what, exactly, that light was.

const short = (n: string) => n.replace(/^superai-/, "");

function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function HivePanel({ hive }: { hive: ReturnType<typeof useHive> }) {
  const { status, tasks, ready, stage } = hive;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!status || status.role === "") {
    return <Vacant>This SuperAI is standalone. Give it a hive role and its workers appear here.</Vacant>;
  }

  const live = status.members.filter((m) => m.state === "live").length;
  const ordered = [...tasks].sort(
    (a, b) =>
      Number(b.state === "running") - Number(a.state === "running") ||
      Date.parse(b.started_at) - Date.parse(a.started_at),
  );
  const running = tasks.filter((t) => t.state === "running").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-[3]">
        <HiveStageView
          ref={stage}
          role={status.role}
          self={status.name}
          workers={status.members}
          tasks={tasks}
          ready={ready}
        />
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-rule-soft px-4 py-1.5 text-[10px] tracking-[0.12em] text-ink-3">
        <span className="font-semibold text-sig-model">{status.role.toUpperCase()}</span>
        {status.role === "queen" ? (
          <span>
            {live} live of {status.members.length}
          </span>
        ) : (
          <span className={status.queen?.joined ? "" : "text-sig-bad"}>
            {status.queen?.joined ? "joined the queen" : status.queen?.error || "not joined"}
          </span>
        )}
        <span className="flex-1" />
        {running > 0 ? <span className="text-sig-model">{running} running</span> : null}
      </div>
      <ul className="min-h-0 flex-[2] overflow-y-auto border-t border-rule-soft">
        {ordered.length === 0 ? (
          <li>
            <Vacant>
              {status.role === "queen"
                ? "No orders yet. Ask it to have the workers do something."
                : "No orders received yet."}
            </Vacant>
          </li>
        ) : (
          ordered.map((t) => {
            const end = t.ended_at && !t.ended_at.startsWith("0001") ? Date.parse(t.ended_at) : now;
            const doing =
              t.state !== "running"
                ? t.state
                : t.phase === "tool"
                  ? `⚙ ${t.tool || "tool"}`
                  : t.phase === "writing"
                    ? "writing…"
                    : "thinking…";
            const tone =
              t.state === "running"
                ? "text-sig-model"
                : t.state === "done"
                  ? "text-orb-hot"
                  : t.state === "failed"
                    ? "text-sig-bad"
                    : "text-sig-tool";
            return (
              <li
                key={t.id}
                className="grid grid-cols-[10px_auto_1fr_auto_auto] items-center gap-3 border-b border-rule-soft px-4 py-2 text-[11px]"
                title={`${t.id}\n\n${t.prompt}`}
              >
                <span
                  className={`h-[6px] w-[6px] rounded-full bg-current ${tone} ${
                    t.state === "running" ? "animate-pulse" : ""
                  }`}
                />
                <span className="whitespace-nowrap text-ink-2">
                  {t.dir === "peer"
                    ? `${short(t.from ?? "")} ⇄ ${short(t.worker)}`
                    : t.dir === "out"
                      ? `→ ${short(t.worker)}`
                      : "← queen"}
                </span>
                <span className="truncate text-ink-1">{t.prompt}</span>
                <span className={`whitespace-nowrap ${tone}`}>
                  {doing}
                  {t.tools > 0 ? ` · ${t.tools}` : ""}
                </span>
                <span className="w-[4ch] whitespace-nowrap text-right tabular-nums text-ink-3">
                  {span(end - Date.parse(t.started_at))}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
