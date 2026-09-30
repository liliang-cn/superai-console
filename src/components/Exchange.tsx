import { useEffect, useRef, useState } from "react";
import { AIRenderer } from "@ai-gui/react";
import type { Turn } from "../lib/chat";
import { APP_LOCALE, normalizeOneLineBlocks, plugins, registry } from "../lib/aigui";
import { Vacant } from "./Panel";
import { useThemeValue } from "../lib/theme";

// What was said, and what came back.
//
// The other three panels are instrumentation — what the machine did. This one
// is the conversation, and it is the only place on the page where the agent
// speaks in its own words. It earns the brightest ink for that reason.
//
// The answer goes through AIGUI, the same renderer the desktop app uses, so a
// table is a table and a formula is a formula rather than a fence the reader
// decodes by eye.

/**
 * Waiting says how long this turn has been silent.
 *
 * It is here because the silence is real and long. The model behind this
 * console is served by a gateway that buffers: measured against it, nothing
 * arrives for about seven seconds and then the whole answer lands inside half
 * a second. There is no streaming to show, so the honest thing is to show the
 * wait instead of an ambiguous blinking cursor that implies text is trickling
 * in when none is.
 */
function Waiting() {
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = (now - since) / 1000;
  return (
    <p className="pl-[18px] text-[13px] text-ink-3">
      thinking
      <span className="ml-2 tabular-nums">{s.toFixed(1)}s</span>
    </p>
  );
}

export default function Exchange(props: Parameters<typeof ExchangeBody>[0]) {
  // Answers are rendered in the page's theme, so a table or chart in one
  // follows a switch like everything else.
  return <ExchangeBody {...props} theme={useThemeValue()} />;
}

function ExchangeBody({
  turns,
  speaking,
  theme = "dark",
}: {
  theme?: "dark" | "light";
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
            <li key={t.id || `pending-${i}`} className="arrive space-y-1.5">
              {/* Heard. Dimmer than the answer and marked, because the one
                  thing worth checking at a glance is whether it heard you
                  correctly — and that is easiest when it does not compete
                  with the reply. */}
              <p className="flex gap-2 text-[13px] leading-[1.6] text-ink-2">
                <span className="shrink-0 select-none text-ink-3">›</span>
                <span className="min-w-0">{t.said}</span>
              </p>

              {t.state === "error" ? (
                <p className="pl-[18px] text-[13px] leading-[1.6] text-sig-bad">{t.error}</p>
              ) : t.reply ? (
                <div className="ai-answer pl-[18px] text-[13px] leading-[1.7] text-ink-0">
                  <AIRenderer
                    // Controlled by `text`: handing over the whole string on
                    // every update lets AIGUI push only the delta, which is
                    // the shape a growing reply already has.
                    text={normalizeOneLineBlocks(t.reply)}
                    registry={registry}
                    plugins={plugins}
                    theme={theme}
                    locale={APP_LOCALE}
                  />
                  {t.state === "cancelled" ? (
                    <span className="text-[11px] text-ink-3">stopped</span>
                  ) : null}
                </div>
              ) : live ? (
                <Waiting />
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
