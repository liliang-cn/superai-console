import { useCallback, useEffect, useRef, useState } from "react";
import { events as openEvents, rpc } from "./api";
import type { StageHandle, StagePulse } from "../components/HiveStage";

// The hive, as this console sees it.
//
// A SuperAI is standalone, a queen or a worker, and the console only has a hive
// mode when it is one of the last two. The role comes from HiveStatus; the
// orders come as they happen on the stream the console already listens to.
// Polling is used for the one thing that has no event — a worker going quiet is
// the absence of one — and nothing else.

export type HiveMember = {
  name: string;
  state: "live" | "lost";
  engine?: string;
  url: string;
};

export type HiveTask = {
  id: string;
  worker: string;
  from?: string;
  dir: "out" | "in" | "peer";
  prompt: string;
  state: "running" | "done" | "failed" | "cancelled";
  phase?: string;
  tool?: string;
  tools: number;
  started_at: string;
  ended_at?: string;
  result?: string;
  error?: string;
};

export type HiveStatus = {
  role: "" | "queen" | "worker";
  name: string;
  members: HiveMember[];
  tasks?: HiveTask[];
  queen?: { url: string; joined: boolean; error: string };
};

export function useHive() {
  const [status, setStatus] = useState<HiveStatus | null>(null);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const [ready, setReady] = useState(false);
  const stage = useRef<StageHandle>(null);
  const seeded = useRef(false);

  const load = useCallback(async () => {
    try {
      const s = await rpc<HiveStatus>("HiveStatus");
      setStatus(s);
      // Only the first load seeds the list; after that the stream is the
      // source, and replacing it from a poll would drop a change that arrived
      // a moment before the poll's answer did.
      if (!seeded.current) {
        seeded.current = true;
        setTasks(s.tasks ?? []);
      }
      setReady(true);
    } catch {
      // A backend that predates the hive has no such method. That is a
      // standalone install as far as this console is concerned.
      setStatus({ role: "", name: "", members: [] });
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    return openEvents((ev) => {
      if (ev.name === "hive:task") {
        const t = ev.payload as HiveTask;
        if (!t?.id) return;
        setTasks((cur) => {
          const i = cur.findIndex((k) => k.id === t.id);
          if (i < 0) return [...cur, t].slice(-80);
          const next = cur.slice();
          next[i] = t;
          return next;
        });
      } else if (ev.name === "hive:pulse") {
        // Straight to the stage: a re-render per pulse would be one per token.
        stage.current?.pulse(ev.payload as StagePulse);
      }
    });
  }, []);

  const role = status?.role ?? "";
  return { status, tasks, ready, stage, role, active: role !== "" };
}
