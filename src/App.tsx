import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  events as openEvents,
  fold,
  frameOf,
  memoryTool,
  meterFromSnapshot,
  rpc,
  type Meter,
  type PulseSnapshot,
} from "./lib/api";
import { useVoice } from "./lib/voice";
import VoiceOrb from "./components/VoiceOrb";
import Panel from "./components/Panel";
import MemoryFeed from "./components/MemoryFeed";
import Tasks from "./components/Tasks";
import IOFeed from "./components/IOFeed";

// One console.
//
// Everything on this page comes off a single event stream. The only thing
// fetched is the first frame, so there is a window to draw before the stream
// has said anything — after that nothing polls, because the backend already
// pushes several frames a second and asking again for what is arriving anyway
// is how a live page ends up a second behind itself.

/** The session Telegram-style: one conversation for this console, so what is
 *  said here has continuity and shows up in the desktop app's History. */
const SESSION = "console";

function useMeter() {
  const [meter, setMeter] = useState<Meter | null>(null);
  const [error, setError] = useState("");
  // The stream subscription must not be torn down and rebuilt on every frame,
  // so the fold happens against the ref rather than against captured state.
  const ref = useRef<Meter | null>(null);

  useEffect(() => {
    let live = true;
    rpc<PulseSnapshot>("Pulse")
      .then((s) => {
        if (!live) return;
        const m = meterFromSnapshot(s);
        ref.current = m;
        setMeter(m);
      })
      .catch((e) => live && setError(String(e)));

    const close = openEvents((ev) => {
      if (ev.name !== "pulse:frame" || !ref.current) return;
      const frame = frameOf(ev.payload);
      if (!frame) return;
      ref.current = fold(ref.current, frame);
      setMeter(ref.current);
    });
    return () => {
      live = false;
      close();
    };
  }, []);

  return { meter, error };
}

export default function App() {
  const { meter, error } = useMeter();
  const [sent, setSent] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const say = useCallback(async (text: string) => {
    setSent((s) => [...s.slice(-8), text]);
    setSending(true);
    try {
      await rpc<string>("SendChat", SESSION, text, null);
    } finally {
      setSending(false);
    }
  }, []);

  const voice = useVoice(say);

  // How hard the agent is working, 0..1, for the orb's colour and spin. Runs
  // in flight is the honest signal: token counts are cumulative and would have
  // the orb burning all day after one busy minute.
  const activity = useMemo(() => {
    if (!meter) return 0;
    const runs = meter.runs.length;
    if (runs === 0) return meter.live ? 0.25 : 0;
    return Math.min(1, 0.45 + runs * 0.25);
  }, [meter]);

  const memories = useMemo(
    () => (meter ? meter.events.filter((e) => e.kind === "tool" && memoryTool(e.name)) : []),
    [meter],
  );

  return (
    <div className="flex h-dvh flex-col bg-black text-white/80">
      <header className="flex shrink-0 items-baseline gap-4 border-b border-white/8 px-4 py-2.5">
        <h1 className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
          SuperAI
        </h1>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
          Console
        </span>
        <span className="flex-1" />
        <Status meter={meter} error={error} />
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(220px,0.9fr)_1fr_1fr] gap-px bg-white/[0.06] lg:grid-cols-[1.1fr_1fr_1fr] lg:grid-rows-[1fr_1fr]">
        {/* The orb spans both rows of its column on a wide screen: it is the
            one thing here that is a shape rather than a list, and cramming it
            into a list-sized cell wastes what it is for. */}
        <Panel
          title="Voice"
          note={voice.listening ? "listening" : voice.canTranscribe ? "idle" : "no transcription"}
          className="lg:row-span-2"
        >
          <div className="relative flex h-full flex-col">
            <div className="relative min-h-0 flex-1">
              <VoiceOrb level={voice.level} activity={activity} />
            </div>
            <div className="shrink-0 space-y-2 px-3 pb-3">
              {/* What is being heard, before it is a message. Reserved height
                  so the button does not jump as words arrive. */}
              <p className="min-h-[2.5rem] font-mono text-[11px] leading-relaxed text-white/45">
                {voice.partial ||
                  (sent.length ? <span className="text-white/25">{sent[sent.length - 1]}</span> : "")}
              </p>
              {voice.error ? (
                <p className="font-mono text-[10px] text-rose-400/80">{voice.error}</p>
              ) : null}
              <button
                type="button"
                onClick={voice.listening ? voice.stop : voice.start}
                className={`w-full border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  voice.listening
                    ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200/90 hover:bg-cyan-300/15"
                    : "border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
                }`}
              >
                {voice.listening ? "Stop" : "Listen"}
              </button>
              {!voice.canTranscribe ? (
                <p className="font-mono text-[10px] leading-relaxed text-white/25">
                  This browser has no speech recognition, so the shape follows your
                  voice but nothing is transcribed. Chrome has it.
                </p>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel
          title="Memory"
          note={meter ? `${meter.memory} calls` : undefined}
        >
          <MemoryFeed events={memories} />
        </Panel>

        <Panel
          title="Task"
          note={meter?.runs.length ? `${meter.runs.length} in flight` : sending ? "sending" : undefined}
        >
          <Tasks runs={meter?.runs ?? []} />
        </Panel>

        <Panel
          title="In · Out"
          note={meter ? `${meter.tokens.toLocaleString()} tokens · ${meter.calls} calls` : undefined}
          className="lg:col-span-2"
        >
          <IOFeed events={meter?.events ?? []} />
        </Panel>
      </main>
    </div>
  );
}

function Status({ meter, error }: { meter: Meter | null; error: string }) {
  if (error) {
    return (
      <span className="font-mono text-[10px] text-rose-400/80" title={error}>
        disconnected
      </span>
    );
  }
  if (!meter) {
    return <span className="font-mono text-[10px] text-white/25">connecting…</span>;
  }
  return (
    <span className="flex items-center gap-4 font-mono text-[10px] tabular-nums text-white/30">
      <span className="flex items-center gap-1.5">
        <span
          className={`h-[5px] w-[5px] rounded-full ${meter.live ? "bg-cyan-300/80" : "bg-white/25"}`}
        />
        {meter.live ? "live" : "idle"}
      </span>
      <span>{meter.goroutines}g</span>
      <span>{Math.round(meter.cpu)}% cpu</span>
      <span>{(meter.heap / 1024 / 1024).toFixed(0)}MB</span>
    </span>
  );
}
