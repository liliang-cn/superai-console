// Talking to SuperAI.
//
// Two surfaces, and they are not interchangeable. Anything the console asks
// for goes out as one POST per method (rpc); anything the agent decides to say
// arrives on a single event stream it never asked for (events). Polling the
// first for what the second already pushes is the mistake this file exists to
// make impossible — Pulse is fetched exactly once, to have something to draw
// before the stream has said anything.
//
// The two shapes are deliberately different and it matters: a snapshot is the
// whole window, a frame is only what changed. The frame's events live under
// `new`, not `events`, and folding one into the other is this file's job
// rather than every panel's.

/** rpc calls one bound App method. Args are positional, as Wails binds them. */
export async function rpc<T>(method: string, ...args: unknown[]): Promise<T> {
  const res = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${method}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** One model turn or tool call, as the meter saw it. */
export type PulseEvent = {
  seq: number;
  at: string;
  /** "tool" | "model" | "think" | "error" | "compact" */
  kind: string;
  name: string;
  text: string;
  /** tokens, on a model turn */
  n?: number;
  ms?: number;
  bad?: boolean;
  /** a tool a sub-agent called rather than the top-level loop */
  inner?: boolean;
};

/** A turn in flight. */
export type PulseRun = {
  runId: string;
  model: string;
  round: number;
  session?: string;
  /** "thinking", a tool's name, or "waiting" */
  doing: string;
  since: string;
  seen: string;
  /** the tail of the reasoning being written right now */
  think?: string;
};

/** The running totals every frame carries. */
export type Totals = {
  tokens: number;
  cached: number;
  rounds: number;
  calls: number;
  reads: number;
  writes: number;
  shells: number;
  fails: number;
  mcp: number;
  memory: number;
  errors: number;
  heap: number;
  cpu: number;
  goroutines: number;
};

/** backend.PulseSnapshot — the whole window, fetched once. */
export type PulseSnapshot = Totals & {
  now: string;
  since: string;
  live: boolean;
  runs: PulseRun[];
  events: PulseEvent[];
};

/** backend.PulseFrame — what changed, pushed several times a second. */
export type PulseFrame = Totals & {
  at: string;
  live: boolean;
  runs: PulseRun[];
  new: PulseEvent[];
};

/** What this console keeps: the window, folded up to the latest frame. */
export type Meter = Totals & {
  live: boolean;
  at: string;
  runs: PulseRun[];
  events: PulseEvent[];
};

/** How many events to keep. Older ones have scrolled away anyway. */
const KEEP = 400;

export function meterFromSnapshot(s: PulseSnapshot): Meter {
  return { ...s, at: s.now, events: s.events.slice(-KEEP) };
}

/**
 * fold applies a frame to the window.
 *
 * Events are appended by sequence rather than trusted to be new: frames go to
 * every listener at once and a client that reconnects mid-second can be handed
 * one it has already seen, which would otherwise draw the same tool call
 * twice.
 */
export function fold(m: Meter, f: PulseFrame): Meter {
  const seen = m.events.length ? m.events[m.events.length - 1].seq : -1;
  const fresh = (f.new ?? []).filter((e) => e.seq > seen);
  return {
    ...m,
    ...f,
    at: f.at,
    runs: f.runs ?? [],
    events: fresh.length ? [...m.events, ...fresh].slice(-KEEP) : m.events,
  };
}

/** A frame off the wire: {"name": ..., "payload": ...}. */
export type ServerEvent = { name: string; payload: unknown };

/**
 * frameOf unwraps a pulse:frame payload.
 *
 * The frame is nested one level deeper than it looks: the backend emits
 * `{"frame": f}`, not `f` (internal/backend/pulse.go — `emit("pulse:frame",
 * map[string]any{"frame": f})`). Reading payload directly gets an object with
 * every field undefined, which renders as a live page that connects, says
 * nothing, and reports no error at all — so this is a named function rather
 * than a `.frame` somewhere in a component.
 */
export function frameOf(payload: unknown): PulseFrame | null {
  const wrapped = payload as { frame?: PulseFrame } | null;
  return wrapped?.frame ?? null;
}

/**
 * events opens the one stream and calls onEvent for everything on it.
 *
 * Returns a function that closes it. EventSource reconnects on its own, so
 * nothing here retries; what it cannot do is send a credential, which is why
 * this path is proxied (see vite.config.ts).
 */
export function events(onEvent: (ev: ServerEvent) => void): () => void {
  const src = new EventSource("/api/events");
  src.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as ServerEvent);
    } catch {
      // A frame this build cannot parse is not a reason to tear the stream
      // down; the next one is probably fine.
    }
  };
  return () => src.close();
}

/**
 * memoryTool reports whether an event is the agent touching its memory.
 *
 * Word for word the rule the backend counts by (isMemoryTool, in
 * internal/backend/pulse.go). Kept identical on purpose: this panel's list and
 * the `memory` total in the same frame would otherwise disagree, and the one
 * on screen next to the other is exactly where that shows.
 */
export function memoryTool(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("memory") ||
    n.includes("knowledge") ||
    n.includes("recall") ||
    n.includes("remember") ||
    n.includes("cortex")
  );
}
