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
import { usePhone } from "./lib/room";
import { useVoice } from "./lib/voice";
import VoiceOrb from "./components/VoiceOrb";
import LevelBar from "./components/LevelBar";
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
//
// There is no navigation and no second page. The only thing that changes is
// whether the agent is doing anything, so this is three states of one screen
// rather than three screens, and the design's job is to make the difference
// between them legible from across a desk.

/** The session, Telegram-style: one conversation for this console, so what is
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

type Feed = "task" | "memory" | "io";

export default function App() {
  const { meter, error } = useMeter();
  const phone = usePhone();
  const [feed, setFeed] = useState<Feed>("task");
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

  const counts = {
    memory: meter ? `${meter.memory} calls` : undefined,
    task: meter?.runs.length ? `${meter.runs.length} in flight` : sending ? "sending" : "none",
    io: meter ? `${meter.tokens.toLocaleString()} tokens · ${meter.calls} calls` : undefined,
  };

  const voicePanel = (
    <Panel
      title="VOICE"
      note={voice.listening ? <Lit>listening</Lit> : voice.canTranscribe ? "closed" : "no transcription"}
      // h-full matters on a phone: there the panel is put inside a sized box
      // rather than a grid cell, and without it it shrinks to its content —
      // the orb's flex-1 then has no height to claim and the canvas spills
      // out behind the controls.
      className={phone ? "h-full" : "row-span-2 border-r border-rule"}
    >
      <div className="flex h-full flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          <VoiceOrb level={voice.level} activity={activity} />
          <div className="absolute bottom-5 flex w-full justify-center px-4">
            <LevelBar level={voice.level} on={voice.listening} />
          </div>
        </div>
        <div className="shrink-0 space-y-3 px-4 pb-4">
          {/* Reserved height, so the button does not jump as words arrive.
              Settled words read bright, the interim tail dim: the difference
              between what was heard and what will be sent is worth seeing
              before the message goes. */}
          <p className="min-h-[42px] text-[13px] leading-[1.6]">
            {voice.partial ? (
              <span className="text-ink-3">{voice.partial}</span>
            ) : sent.length ? (
              <span className="text-ink-0">{sent[sent.length - 1]}</span>
            ) : (
              <span className="text-ink-3">
                Press listen, then speak. What is heard goes to SuperAI as a message.
              </span>
            )}
          </p>
          {voice.error ? <p className="text-[11px] text-sig-bad">{voice.error}</p> : null}
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            className={`h-[46px] w-full border text-[11px] font-medium tracking-[0.22em] transition-colors ${
              voice.listening
                ? "border-sig-model/45 bg-sig-model/10 text-sig-model hover:bg-sig-model/15"
                : "border-white/20 text-ink-1 hover:border-white/35 hover:text-ink-0"
            }`}
          >
            {voice.listening ? "STOP" : "LISTEN"}
          </button>
          {!voice.canTranscribe ? (
            <p className="text-[11px] leading-[1.6] text-ink-3">
              This browser has no speech recognition, so the shape follows your voice but
              nothing is transcribed. Chrome has it.
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  );

  return (
    <div className="flex h-dvh flex-col bg-black text-ink-1">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-rule px-5">
        <span className="text-xs font-semibold tracking-[0.34em] text-ink-0">SUPERAI</span>
        {!phone ? (
          <span className="text-[10px] font-medium tracking-[0.26em] text-ink-3">CONSOLE</span>
        ) : null}
        <span className="flex-1" />
        <Status meter={meter} error={error} phone={phone} />
      </header>

      {phone ? (
        // Three feeds become one, chosen here. Stacked, each would get four
        // rows on a 390px screen — worse than one list with twelve.
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="h-[46%] shrink-0 border-b border-rule">{voicePanel}</div>
          <nav className="flex shrink-0 border-b border-rule" aria-label="Feed">
            {(
              [
                ["task", "TASK"],
                ["memory", "MEMORY"],
                ["io", "IN · OUT"],
              ] as [Feed, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={feed === key}
                onClick={() => setFeed(key)}
                className={`h-11 flex-1 border-b-2 text-[10px] font-semibold tracking-[0.16em] transition-colors ${
                  feed === key
                    ? "border-sig-model text-sig-model"
                    : "border-transparent text-ink-2 hover:text-ink-0"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1">
            <Panel
              title={feed === "task" ? "TASK" : feed === "memory" ? "MEMORY" : "IN · OUT"}
              note={counts[feed]}
              className="h-full"
            >
              {feed === "task" ? (
                <Tasks runs={meter?.runs ?? []} meter={meter} />
              ) : feed === "memory" ? (
                <MemoryFeed events={memories} />
              ) : (
                <IOFeed events={meter?.events ?? []} />
              )}
            </Panel>
          </div>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-[500px_1fr_1fr] grid-rows-2">
          {voicePanel}
          <Panel title="MEMORY" note={counts.memory} className="border-r border-b border-rule">
            <MemoryFeed events={memories} />
          </Panel>
          {/* Task sits top right and carries the weight: it is the only panel
              about *now*. */}
          <Panel title="TASK" note={counts.task} className="border-b border-rule">
            <Tasks runs={meter?.runs ?? []} meter={meter} />
          </Panel>
          <Panel title="IN · OUT" note={counts.io} className="col-span-2">
            <IOFeed events={meter?.events ?? []} />
          </Panel>
        </main>
      )}
    </div>
  );
}

/** A state that is currently true, with its dot. */
function Lit({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-sig-model">
      <span className="h-[5px] w-[5px] rounded-full bg-sig-model" />
      {children}
    </span>
  );
}

function Status({
  meter,
  error,
  phone,
}: {
  meter: Meter | null;
  error: string;
  phone: boolean;
}) {
  if (error) {
    return (
      <span className="text-[11px] text-sig-bad" title={error}>
        disconnected
      </span>
    );
  }
  if (!meter) return <span className="text-[11px] text-ink-3">connecting…</span>;
  return (
    <span className="flex items-center gap-4 text-[11px] text-ink-3">
      {meter.live ? (
        <Lit>live</Lit>
      ) : (
        <span className="flex items-center gap-1.5 text-ink-2">
          <span className="h-[5px] w-[5px] rounded-full bg-ink-3" />
          idle
        </span>
      )}
      {!phone ? (
        <>
          <span>{meter.goroutines}g</span>
          <span>{Math.round(meter.cpu)}% cpu</span>
        </>
      ) : null}
      <span>{(meter.heap / 1024 / 1024).toFixed(0)} MB</span>
    </span>
  );
}
