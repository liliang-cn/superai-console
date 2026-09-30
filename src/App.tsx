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
import { useChat } from "./lib/chat";
import { useSpeaker } from "./lib/speak";
import VoiceOrb from "./components/VoiceOrb";
import LevelBar from "./components/LevelBar";
import Panel from "./components/Panel";
import MemoryFeed from "./components/MemoryFeed";
import Tasks from "./components/Tasks";
import IOFeed from "./components/IOFeed";
import Exchange from "./components/Exchange";
import Gate, { useSession } from "./components/Gate";
import MemoryGraph, { useGraph } from "./components/MemoryGraph";
import Meters from "./components/Meters";
import HivePanel from "./components/HivePanel";
import { useHive } from "./lib/hive";
import Divider from "./components/Divider";
import { useLayout } from "./lib/layout";

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

type Feed = "said" | "task" | "memory" | "io" | "hive";

export default function App() {
  const [session, setSession] = useSession();
  // Nothing below is mounted until there is a session: useMeter opens the
  // event stream on mount, and an EventSource refused with 401 retries by
  // itself, forever, several times a second.
  if (session === "checking") {
    return <div className="flex h-dvh items-center justify-center bg-black text-[11px] tracking-[0.2em] text-ink-3">…</div>;
  }
  if (session === "out") {
    return <Gate onIn={() => setSession("in")} />;
  }
  return <Console />;
}

function Console() {
  const { meter, error } = useMeter();
  const phone = usePhone();
  const [feed, setFeed] = useState<Feed>("said");
  const [typed, setTyped] = useState("");
  // Hive mode. It exists only when this SuperAI is a queen or a worker; on a
  // standalone one none of it is drawn and the console is exactly what it was.
  const hive = useHive();
  const [taskView, setTaskView] = useState<"task" | "hive">("task");
  // The first time the backend turns out to be part of a hive, show it: that is
  // what someone opening the console on a queen came to see. After that the
  // choice is theirs and is not taken back.
  const hiveSeen = useRef(false);
  useEffect(() => {
    if (hive.active && !hiveSeen.current) {
      hiveSeen.current = true;
      setTaskView("hive");
    }
  }, [hive.active]);
  const graph = useGraph();
  const { layout, drag, reset } = useLayout();

  // The loop, in the order it has to be built: something to send with,
  // something to say it with, and only then the ear — because the ear has to
  // be handed the switch that closes it while the mouth is open.
  //
  // Declared before useVoice and read through a ref because the three refer to
  // each other in a circle: the speaker suspends the voice, the voice's
  // utterances are sent by the chat, and the chat's answers are spoken. The
  // ref is where the circle is cut.
  const voiceRef = useRef<{ suspend: (quiet: boolean) => void } | null>(null);
  const speaker = useSpeaker((quiet) => voiceRef.current?.suspend(quiet));
  const chat = useChat(SESSION, (answer) => speaker.say(answer));
  const voice = useVoice(
    useCallback(
      (text: string) => {
        // Barge-in: speaking over the answer stops it. Without this the only
        // way to interrupt a long reply is to wait it out, and a console you
        // cannot interrupt is one you stop talking to.
        speaker.shut();
        void chat.send(text);
      },
      [chat, speaker],
    ),
  );
  voiceRef.current = voice;

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

  const counts: Record<Feed, React.ReactNode> = {
    said: chat.busy ? <Lit>answering</Lit> : chat.turns.length ? `${chat.turns.length} turns` : "none",
    memory: meter ? `${meter.memory} calls` : undefined,
    task: meter?.runs.length ? `${meter.runs.length} in flight` : chat.busy ? "sending" : "none",
    io: meter ? `${meter.tokens.toLocaleString()} tokens · ${meter.calls} calls` : undefined,
    hive: hive.status
      ? hive.role === "queen"
        ? `${hive.status.members.filter((m) => m.state === "live").length} live`
        : hive.role
      : undefined,
  };

  const voicePanel = (
    <Panel
      title="VOICE"
      note={
        speaker.speaking ? (
          <Lit>speaking</Lit>
        ) : voice.listening ? (
          <Lit>listening</Lit>
        ) : voice.canTranscribe ? (
          "closed"
        ) : (
          "no transcription"
        )
      }
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
            ) : chat.turns.length ? (
              <span className="text-ink-0">{chat.turns[chat.turns.length - 1].said}</span>
            ) : (
              <span className="text-ink-3">
                Press listen, then speak. What is heard goes to SuperAI as a message.
              </span>
            )}
          </p>
          {voice.error ? <p className="text-[11px] text-sig-bad">{voice.error}</p> : null}
          {/* The keyboard way in.
              Not a fallback bolted on: speech recognition is Chrome-only and
              the microphone needs HTTPS or localhost, so on every other
              browser and on any box reached by IP this is the only way to say
              anything at all. It sends down the identical path a spoken
              sentence does, so nothing downstream has two cases to handle. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = typed.trim();
              if (!text) return;
              setTyped("");
              speaker.shut();
              void chat.send(text);
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="or type a message"
              aria-label="Message SuperAI"
              className="h-[42px] w-full border border-white/12 bg-transparent px-3 text-[13px] text-ink-0 placeholder:text-ink-3 focus:border-sig-model/50 focus:outline-none"
            />
          </form>
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
        <Status meter={meter} error={error} phone={phone} hive={hive.active ? counts.hive : null} role={hive.role} />
      </header>

      {phone ? (
        // Three feeds become one, chosen here. Stacked, each would get four
        // rows on a 390px screen — worse than one list with twelve.
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="h-[46%] shrink-0 border-b border-rule">{voicePanel}</div>
          <nav className="flex shrink-0 border-b border-rule" aria-label="Feed">
            {(
              [
                ["said", "SAID"],
                ["task", "TASK"],
                ...(hive.active ? [["hive", "HIVE"]] : []),
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
              title={
                feed === "said"
                  ? "EXCHANGE"
                  : feed === "task"
                    ? "TASK"
                    : feed === "hive"
                      ? "HIVE"
                      : feed === "memory"
                        ? "MEMORY"
                        : "IN · OUT"
              }
              note={counts[feed]}
              className="h-full"
            >
              {feed === "said" ? (
                <Exchange turns={chat.turns} speaking={speaker.speaking} />
              ) : feed === "task" ? (
                <Tasks runs={meter?.runs ?? []} meter={meter} />
              ) : feed === "hive" ? (
                <HivePanel hive={hive} />
              ) : feed === "memory" ? (
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1">
                    <MemoryGraph graph={graph} />
                  </div>
                  <div
                    className={`min-h-0 shrink-0 border-t border-rule-soft ${
                      memories.length ? "h-[45%]" : "h-auto"
                    }`}
                  >
                    <MemoryFeed events={memories} />
                  </div>
                </div>
              ) : (
                <IOFeed events={meter?.events ?? []} />
              )}
            </Panel>
          </div>
        </main>
      ) : (
        <main
          data-grid
          className="relative grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `${layout.voice}px minmax(0, ${layout.mid}fr) minmax(0, ${1 - layout.mid}fr)`,
            gridTemplateRows: `minmax(0, ${layout.top}fr) minmax(0, ${1 - layout.top}fr)`,
          }}
        >
          {voicePanel}
          {/* What it knows, over what it just did with it. The graph takes the
              larger share: it is the only thing on this screen that shows
              shape rather than sequence, and a list can be read in a strip
              while a graph cannot. */}
          <Panel title="MEMORY" note={counts.memory} className="border-r border-b border-rule">
            <div className="flex h-full flex-col">
              {/* The graph takes what the log is not using. Fixed shares put a
                  4,657-edge nebula in 234px while an empty feed sat under it
                  holding half the panel for two lines of placeholder. */}
              <div className="min-h-0 flex-1">
                <MemoryGraph graph={graph} />
              </div>
              <div
                className={`min-h-0 shrink-0 border-t border-rule-soft ${
                  memories.length ? "h-[40%]" : "h-auto"
                }`}
              >
                <MemoryFeed events={memories} />
              </div>
            </div>
          </Panel>
          {/* Task sits top right and carries the weight: it is the only panel
              about *now*. */}
          <Panel
            title={hive.active && taskView === "hive" ? "HIVE" : "TASK"}
            note={
              hive.active ? (
                <span className="flex items-center gap-3">
                  <span>{taskView === "hive" ? counts.hive : counts.task}</span>
                  <span className="flex" role="group" aria-label="Task or hive">
                    {(["task", "hive"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={taskView === k}
                        onClick={() => setTaskView(k)}
                        className={`px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] transition-colors ${
                          taskView === k ? "text-sig-model" : "text-ink-3 hover:text-ink-0"
                        }`}
                      >
                        {k.toUpperCase()}
                      </button>
                    ))}
                  </span>
                </span>
              ) : (
                counts.task
              )
            }
            className="border-b border-rule"
          >
            {hive.active && taskView === "hive" ? (
              <HivePanel hive={hive} />
            ) : (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1">
                  <Tasks runs={meter?.runs ?? []} meter={meter} />
                </div>
                <div className="shrink-0 border-t border-rule-soft">
                  <Meters meter={meter} />
                </div>
              </div>
            )}
          </Panel>
          {/* The conversation takes the bottom middle rather than a corner:
              it is the only panel where the agent speaks in its own words,
              and the telemetry beside it is what it did to get there. */}
          <Panel
            title="EXCHANGE"
            note={chat.busy ? <Lit>answering</Lit> : chat.turns.length ? `${chat.turns.length} turns` : undefined}
            className="border-r border-rule"
          >
            <Exchange turns={chat.turns} speaking={speaker.speaking} />
          </Panel>
          <Panel title="IN · OUT" note={counts.io}>
            <IOFeed events={meter?.events ?? []} />
          </Panel>

          {/* The seams. Positioned from the same numbers that built the
              template above, so they sit exactly on the edges without
              measuring anything. Double-click any of them to put the layout
              back. */}
          <Divider
              axis="x"
              at={`${layout.voice}px`}
              onGrab={drag("voice")}
              onReset={reset}
              title="Resize the voice column · double-click to reset"
            />
            <Divider
              axis="x"
              at={`calc(${layout.voice}px + (100% - ${layout.voice}px) * ${layout.mid})`}
              onGrab={drag("mid")}
              onReset={reset}
              title="Resize the feeds · double-click to reset"
            />
            <Divider
              axis="y"
              at={`${layout.top * 100}%`}
              onGrab={drag("top")}
              onReset={reset}
              title="Resize the rows · double-click to reset"
            />
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
  hive,
  role,
}: {
  meter: Meter | null;
  error: string;
  phone: boolean;
  hive: React.ReactNode;
  role: string;
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
      {role ? (
        <span className="flex items-center gap-1.5 text-ink-1" title="This SuperAI is part of a hive">
          <span className="text-[9px] font-semibold tracking-[0.18em] text-sig-model">{role.toUpperCase()}</span>
          {role === "queen" ? hive : null}
        </span>
      ) : null}
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
