import { useCallback, useEffect, useRef, useState } from "react";

// Reading the answer out loud.
//
// The trap this exists to avoid: the microphone is open and the speakers are
// on, so the recogniser hears the assistant and sends it straight back as
// something the user said. The console then answers its own answer, and does
// it again, and the only way out is the stop button. It is not a rare race —
// it happens on the very first reply.
//
// So speaking and listening are interlocked. Whoever calls this hands over a
// way to suspend the recogniser, and it stays suspended from just before the
// first word to just after the last. `speechSynthesis` fires `onend` late and
// sometimes not at all, so there is a floor on the wait and a hard ceiling.

/** How long to keep the ear closed after the voice stops, so the tail of a
 *  word through a speaker does not arrive as a new sentence. */
const TAIL_MS = 350;

/** Nothing should hold the microphone shut forever because a `onend` never
 *  came. Long enough for a paragraph, short enough to recover from. */
const CEILING_MS = 90_000;

export type Speaker = {
  speaking: boolean;
  /** Whether this browser can speak at all. */
  can: boolean;
  /** Read text aloud, suspending the ear while it does. */
  say: (text: string) => void;
  /** Stop mid-sentence — the barge-in. */
  shut: () => void;
};

/**
 * useSpeaker reads answers aloud.
 *
 * `suspend` is called with true before speaking and false after; pass the
 * thing that pauses recognition. It is required rather than optional because
 * the version without it is the bug described above, and an optional argument
 * is an invitation to omit it.
 */
export function useSpeaker(suspend: (quiet: boolean) => void): Speaker {
  const [speaking, setSpeaking] = useState(false);
  const can = typeof window !== "undefined" && "speechSynthesis" in window;
  // The suspend callback is rebuilt every render by its owner; the utterance
  // handlers below are created once per sentence and must call the current
  // one.
  const suspendRef = useRef(suspend);
  suspendRef.current = suspend;
  const timerRef = useRef<number>(0);

  const release = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSpeaking(false);
      suspendRef.current(false);
    }, TAIL_MS);
  }, []);

  const shut = useCallback(() => {
    if (!can) return;
    window.speechSynthesis.cancel();
    window.clearTimeout(timerRef.current);
    setSpeaking(false);
    suspendRef.current(false);
  }, [can]);

  const say = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!can || !body) return;
      // Whatever was being said is stale the moment there is a newer answer.
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(body);
      u.lang = navigator.language || "zh-CN";
      u.rate = 1.05;
      // Close the ear before the first word, not on `onstart`: synthesis can
      // begin before that handler runs, and the first syllable is enough to
      // be transcribed.
      setSpeaking(true);
      suspendRef.current(true);
      u.onend = release;
      u.onerror = release;
      window.speechSynthesis.speak(u);

      // The ceiling. `onend` is unreliable — a cancelled utterance, a tab
      // that was backgrounded mid-sentence — and a microphone that never
      // reopens looks exactly like a broken app.
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setSpeaking(false);
        suspendRef.current(false);
      }, CEILING_MS);
    },
    [can, release],
  );

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      if (can) window.speechSynthesis.cancel();
    },
    [can],
  );

  return { speaking, can, say, shut };
}
