import { useCallback, useEffect, useRef, useState } from "react";
import { events as openEvents, rpc } from "./api";
import type { StageHandle, StagePulse } from "../components/HiveStage";
import { QUEEN, SELF } from "../components/hiveFx";

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

/** A note between two members; dir is this instance's side of it. */
export type HiveMail = {
  id: string;
  from: string;
  to: string;
  text: string;
  reply_to?: string;
  at: string;
  dir?: "in" | "out" | "peer";
};

export type HiveStatus = {
  role: "" | "queen" | "worker";
  name: string;
  members: HiveMember[];
  tasks?: HiveTask[];
  messages?: HiveMail[];
  queen?: { url: string; name?: string; joined: boolean; error: string };
};

export function useHive() {
  const [status, setStatus] = useState<HiveStatus | null>(null);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const [mail, setMail] = useState<HiveMail[]>([]);
  // The latest status, for the stream handler, which is set up once.
  const statusRef = useRef<HiveStatus | null>(null);
  statusRef.current = status;
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
        setMail((s.messages ?? []).map((m) => ({ ...m, dir: "in" as const })));
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
      } else if (ev.name === "hive:message") {
        const m = ev.payload as HiveMail;
        if (!m?.id) return;
        setMail((cur) => (cur.some((x) => x.id === m.id && x.dir === m.dir) ? cur : [...cur, m].slice(-60)));
        const src = stageId(statusRef.current, m.from);
        const dst = stageId(statusRef.current, m.to);
        if (src && dst) stage.current?.pulse({ task: m.id, worker: m.from, dir: "peer", kind: "message", src, dst, text: m.text });
      }
    });
  }, []);

  // Development only: window.__hiveDemo() plays made-up traffic over whoever is
  // in the hive, so a look can be judged without waiting minutes on a model.
  // Not in a production build at all.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __hiveDemo?: () => void }).__hiveDemo = () => {
      const names = (status?.members ?? []).map((m) => m.name);
      if (!names.length) return;
      const tools = ["bash", "read_file", "kubectl", "web_search", "memory_recall"];
      names.slice(0, Math.min(5, names.length)).forEach((w, i) => {
        const id = `demo-${Date.now()}-${i}`;
        const started = new Date().toISOString();
        const base = { id, worker: w, dir: "out" as const, prompt: "demo order", tools: 0, started_at: started };
        const put = (t: HiveTask) =>
          setTasks((cur) => {
            const k = cur.findIndex((x) => x.id === t.id);
            if (k < 0) return [...cur, t];
            const next = cur.slice();
            next[k] = t;
            return next;
          });
        window.setTimeout(() => put({ ...base, state: "running", phase: "thinking" }), i * 700);
        for (let n = 1; n <= 3; n++) {
          window.setTimeout(() => {
            const tool = tools[(i + n) % tools.length];
            put({ ...base, state: "running", phase: "tool", tool, tools: n });
            stage.current?.pulse({ task: id, worker: w, dir: "out", kind: "tool", tool });
            window.setTimeout(() => stage.current?.pulse({ task: id, worker: w, dir: "out", kind: "result", bytes: 2000 }), 900);
          }, i * 700 + n * 2200);
        }
        window.setTimeout(() => put({ ...base, state: "done", tools: 3 }), i * 700 + 9000);
      });
      if (names.length > 2) {
        const say = (from: string, to: string, text: string, at: number) =>
          window.setTimeout(() => {
            setMail((cur) => [...cur, { id: `demo-m-${Date.now()}`, from, to, text, at: new Date().toISOString(), dir: "peer" as const }]);
            stage.current?.pulse({ task: "m", worker: from, dir: "peer", kind: "message", src: from, dst: to, text });
          }, at);
        say(names[2], QUEEN, "found it: orange2 disk is 97% full", 3000);
        say(names[0], names[2], "the config is in memory under hive/orange", 5200);
      }
      if (names.length > 3) {
        const id = `demo-peer-${Date.now()}`;
        const t: HiveTask = { id, worker: names[1], from: names[3], dir: "peer", prompt: "demo question", state: "running", tools: 0, started_at: new Date().toISOString() };
        window.setTimeout(() => setTasks((cur) => [...cur, t]), 1500);
        window.setTimeout(() => stage.current?.pulse({ task: id, worker: names[1], from: names[3], dir: "peer", kind: "tool", tool: "uptime" }), 4000);
        window.setTimeout(() => setTasks((cur) => cur.map((x) => (x.id === id ? { ...x, state: "done" } : x))), 7500);
      }
    };
  }, [status]);

  const role = status?.role ?? "";
  return { status, tasks, mail, ready, stage, role, active: role !== "" };
}

/** Where a member is on the stage, or undefined when the stage does not draw
 *  it (a worker's peers, on a worker's own stage). */
function stageId(s: HiveStatus | null, name: string): string | undefined {
  if (!s) return undefined;
  if (name === s.name) return s.role === "worker" ? SELF : QUEEN;
  if (s.role === "worker") return name === (s.queen?.name || "queen") || name === "queen" ? QUEEN : undefined;
  return s.members.some((m) => m.name === name) ? name : undefined;
}
