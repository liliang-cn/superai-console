import { useEffect, useRef } from "react";
import type { Turn } from "../lib/chat";
import { Vacant } from "./Panel";

// What was said, and what came back.
//
// The other three panels are instrumentation — what the machine did. This one
// is the conversation, and it is the only place on the page where the agent
// speaks in its own words. It earns the brightest ink for that reason: a
// reader scanning this screen should land here first and on the telemetry
// second.

/** A cursor while text is still arriving, so a pause in a stream reads as a
 *  pause rather than as the end of the answer. */
function Caret() {
  return (
    <span className="ml-0.5 inline-block h-[0.95em] w-[6px] translate-y-[1px] animate-pulse bg-sig-model align-baseline" />
  );
}

export default function Exchange({
  turns,
  speaking,
}: {
  turns: Turn[];
  /** True while this answer is being read aloud, which is worth marking: it
   *  is why the microphone is ignoring you for a moment. */
  speaking: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  if (turns.length === 0) {
    return (
      <Vacant>
        Nothing said yet. Speak, and both halves land here — what was heard, and what
        SuperAI answered.
      </Vacant>
    );
  }

  const last = turns[turns.length - 1];

  return (
    <div ref={boxRef} className="h-full overflow-y-auto px-4 pb-4">
      <ol className="space-y-4">
        {turns.map((t, i) => {
          const live = t.state === "streaming" || t.state === "sending";
          return (
            <li key={t.id || `pending-${i}`} className="space-y-1.5">
              {/* Heard. Dimmer than the answer and marked, because the one
                  thing worth checking at a glance is whether it heard you
                  correctly — and that is easiest when it does not compete
                  with the reply. */}
              <p className="flex gap-2 text-[13px] leading-[1.6] text-ink-2">
                <span className="shrink-0 select-none text-ink-3">›</span>
                <span className="min-w-0">{t.said}</span>
              </p>

              {t.state === "error" ? (
                <p className="pl-[18px] text-[13px] leading-[1.6] text-sig-bad">
                  {t.error}
                </p>
              ) : t.reply ? (
                <p className="whitespace-pre-wrap pl-[18px] text-[13px] leading-[1.7] text-ink-0">
                  {t.reply}
                  {live ? <Caret /> : null}
                  {t.state === "cancelled" ? (
                    <span className="ml-2 text-[11px] text-ink-3">stopped</span>
                  ) : null}
                </p>
              ) : live ? (
                // Sent, nothing back yet. Saying so beats an empty gap that
                // looks like the message was lost.
                <p className="pl-[18px] text-[13px] text-ink-3">
                  thinking
                  <Caret />
                </p>
              ) : null}

              {t === last && speaking ? (
                <p className="pl-[18px] text-[11px] tracking-[0.18em] text-sig-model">
                  SPEAKING · MIC IGNORED
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
