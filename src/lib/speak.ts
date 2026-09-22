import { useCallback, useEffect, useRef, useState } from "react";

// Reading the answer out loud.
//
// Two voices, and the good one is not always available. The backend can
// synthesise through a real model (POST /api/tts, one sentence, mp3 back); if
// this install has none configured it answers 501 and everything falls back to
// the browser's own synthesiser, which is worse but instant and always there.
//
// Sentence at a time, because latency tracks length. Measured against the
// gateway behind /api/tts: ~0.15s per character, so a ninety-character
// paragraph is fifteen seconds of silence and a twenty-character sentence is
// three. The rest does not then stutter because synthesis runs about 1.5x
// faster than speech — once the first sentence is playing the next is ready
// before it is needed.
//
// The trap both paths share: the microphone is open and the speakers are on,
// so the recogniser hears the assistant and sends it back as something the
// user said. The console then answers its own answer. Speaking and listening
// are interlocked for that reason, and the interlock spans the whole queue
// rather than one sentence — a gap between sentences is exactly long enough
// for a recogniser to catch the tail of the last one.

/** How long to keep the ear closed after the voice stops, so the tail of a
 *  word through a speaker does not arrive as a new sentence. */
const TAIL_MS = 350;

/** Nothing may hold the microphone shut forever because an event never came. */
const CEILING_MS = 180_000;

/** Longest piece to send in one request. Past this the wait before the first
 *  sound is what people notice; the backend splits on sentence boundaries and
 *  falls back to a comma, so this is a ceiling rather than a target. */
const PIECE = 60;

export type Speaker = {
  speaking: boolean;
  /** Whether anything can speak at all. */
  can: boolean;
  /** True once the backend has answered with real audio, so the UI can say
   *  which voice is talking rather than guessing. */
  model: boolean;
  say: (text: string) => void;
  /** Stop mid-sentence — the barge-in. */
  shut: () => void;
};

/** Cuts text where a speaker would pause. The backend splits the same way for
 *  anything that asks it to; this is the browser's copy, and it only has to
 *  agree about sentences — a piece that is a little long merely waits a little
 *  longer. */
function sentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text.trim()) {
    buf += ch;
    const ends = "。！？；\n.!?;".includes(ch);
    if (ends || [...buf].length >= PIECE) {
      // Only break on length at a comma, so a cut lands between clauses.
      if (ends || "，,、 ".includes(ch)) {
        const piece = buf.trim();
        if (piece) out.push(piece);
        buf = "";
      }
    }
  }
  const rest = buf.trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * useSpeaker reads answers aloud.
 *
 * `suspend` is called with true before the first word and false after the
 * last; pass the thing that pauses recognition. It is required rather than
 * optional because the version without it is the loop described above, and an
 * optional argument is an invitation to omit it.
 */
export function useSpeaker(suspend: (quiet: boolean) => void): Speaker {
  const [speaking, setSpeaking] = useState(false);
  const [model, setModel] = useState(false);
  const canBrowser = typeof window !== "undefined" && "speechSynthesis" in window;

  const suspendRef = useRef(suspend);
  suspendRef.current = suspend;
  const ceiling = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped on every new utterance and on every stop. A fetch or a playback
  // that finishes after the bump belongs to an answer nobody is waiting for
  // any more, and drops itself.
  const runRef = useRef(0);
  // Backend speech is asked for once. After a 501 there is no point paying a
  // round trip per sentence to be told the same thing.
  const backendRef = useRef<boolean | null>(null);

  const release = useCallback(() => {
    window.clearTimeout(ceiling.current);
    ceiling.current = window.setTimeout(() => {
      setSpeaking(false);
      suspendRef.current(false);
    }, TAIL_MS);
  }, []);

  const shut = useCallback(() => {
    runRef.current++;
    window.clearTimeout(ceiling.current);
    if (canBrowser) window.speechSynthesis.cancel();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
    suspendRef.current(false);
  }, [canBrowser]);

  /** The browser's own voice. Instant, worse, and always there. */
  const browserSay = useCallback((text: string) => {
    if (!canBrowser) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || "zh-CN";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, [canBrowser]);

  const say = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body) return;

      // Whatever is being said is stale the moment there is a newer answer.
      shut();
      const run = ++runRef.current;
      const pieces = sentences(body);
      if (!pieces.length) return;

      setSpeaking(true);
      suspendRef.current(true);
      // The ear stays shut for the whole queue, not per sentence: the gap
      // between two sentences is long enough for a recogniser to catch the
      // tail of the first.
      window.clearTimeout(ceiling.current);
      ceiling.current = window.setTimeout(() => {
        setSpeaking(false);
        suspendRef.current(false);
      }, CEILING_MS);

      const fetchPiece = async (s: string): Promise<string | null> => {
        if (backendRef.current === false) return null;
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: s }),
          });
          if (res.status === 501) {
            // Not configured. A state, not a failure — stop asking.
            backendRef.current = false;
            return null;
          }
          if (!res.ok) return null;
          backendRef.current = true;
          setModel(true);
          return URL.createObjectURL(await res.blob());
        } catch {
          return null;
        }
      };

      const play = (url: string) =>
        new Promise<void>((done) => {
          const a = new Audio(url);
          audioRef.current = a;
          const finish = () => {
            URL.revokeObjectURL(url);
            done();
          };
          a.onended = finish;
          a.onerror = finish;
          void a.play().catch(finish);
        });

      void (async () => {
        // The next sentence is fetched while the current one plays, which is
        // what keeps the queue from pausing between them.
        let next = fetchPiece(pieces[0]);
        for (let i = 0; i < pieces.length; i++) {
          const url = await next;
          if (run !== runRef.current) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          next = i + 1 < pieces.length ? fetchPiece(pieces[i + 1]) : Promise.resolve(null);
          if (url) {
            await play(url);
          } else {
            // No backend voice for this piece. Say it in the browser's, and
            // keep going — half an answer read aloud is worse than all of it
            // in a plainer voice.
            browserSay(pieces[i]);
            await new Promise((r) => setTimeout(r, 40 * [...pieces[i]].length));
          }
          if (run !== runRef.current) return;
        }
        if (run === runRef.current) release();
      })();
    },
    [browserSay, release, shut],
  );

  useEffect(
    () => () => {
      window.clearTimeout(ceiling.current);
      if (canBrowser) window.speechSynthesis.cancel();
      audioRef.current?.pause();
    },
    [canBrowser],
  );

  return { speaking, can: canBrowser || backendRef.current !== false, model, say, shut };
}
