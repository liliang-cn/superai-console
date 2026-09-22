import { useCallback, useEffect, useRef, useState } from "react";

// The microphone, and what is done with it.
//
// Two things that look like one feature and are not: the level that drives the
// shape, and the words that become a message. They are split because they fail
// separately — Web Speech is a Chrome-only API that ships the audio to Google
// and can be refused or simply go quiet, while the analyser is local and works
// wherever getUserMedia does. A recogniser that died must not take the shape
// down with it, and the shape must never imply a transcript is coming.

/** How responsive the level is. Attack fast so a word registers immediately;
 *  release slow so the shape breathes down instead of snapping flat. */
const ATTACK = 0.45;
const RELEASE = 0.12;

export type VoiceState = {
  /** true while the microphone is open. */
  listening: boolean;
  /** 0..1, smoothed. Read this every frame; it does not cause a render. */
  level: () => number;
  /** What has been recognised but not yet sent. */
  partial: string;
  /** Why there is no microphone or no recogniser, when there is not. */
  error: string;
  /** Speech recognition is a Chrome thing; elsewhere the shape still works. */
  canTranscribe: boolean;
  start: () => void;
  stop: () => void;
  /**
   * Stop turning sound into words for a moment, without closing the
   * microphone.
   *
   * This is what keeps the console from talking to itself: while an answer is
   * being read aloud the recogniser would otherwise hear it and send it back
   * as something the user said. The microphone deliberately stays open —
   * the level still drives the shape, so the orb keeps moving while SuperAI
   * speaks instead of dying for the length of every answer.
   */
  suspend: (quiet: boolean) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function recogniser(): SpeechRecognitionLike | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? (new Ctor() as SpeechRecognitionLike) : null;
}

/**
 * useVoice opens the microphone on start() and closes it on stop().
 *
 * onUtterance fires once per finished sentence. The level is handed back as a
 * getter rather than as state on purpose: it changes sixty times a second and
 * rendering React that often, to move a mesh three.js is already rendering,
 * would cost more than the animation itself.
 */
export function useVoice(onUtterance: (text: string) => void): VoiceState {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");

  const levelRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Read inside the recogniser's handlers, which are installed once per
  // session; state would be captured stale there and every answer would be
  // heard back exactly once.
  const deafRef = useRef(false);
  // The callback changes on every render of the parent; the recogniser is set
  // up once. Reading it through a ref keeps the subscription stable.
  const sayRef = useRef(onUtterance);
  sayRef.current = onUtterance;

  const canTranscribe = typeof window !== "undefined" && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    recRef.current?.stop();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    levelRef.current = 0;
    setListening(false);
    setPartial("");
  }, []);

  const start = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      // Small window: this is a level meter, not a spectrogram, and a big FFT
      // only adds latency between a syllable and the shape moving.
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS of the waveform around its midpoint, which is loudness rather
        // than whatever the newest sample happened to be.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        // The multiplier is empirical: speech at a normal distance sits around
        // 0.05 RMS, and a meter that only ever reaches a twentieth of its range
        // reads as broken.
        const now = Math.min(1, Math.sqrt(sum / buf.length) * 6);
        const k = now > levelRef.current ? ATTACK : RELEASE;
        levelRef.current += (now - levelRef.current) * k;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setListening(true);

      const rec = recogniser();
      if (!rec) return; // The shape works; the words do not. Not an error.
      rec.lang = navigator.language || "zh-CN";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        // Suspended: the sound in the room is this console's own voice.
        if (deafRef.current) return;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const text = String(r[0].transcript).trim();
            if (text) sayRef.current(text);
          } else {
            interim += r[0].transcript;
          }
        }
        setPartial(interim);
      };
      rec.onerror = (e: any) => {
        // "no-speech" and "aborted" are what a quiet room and a stop button
        // sound like. Reporting them would put a red line on screen every
        // time nobody said anything.
        const kind = String(e?.error ?? "");
        if (kind && kind !== "no-speech" && kind !== "aborted") setError(kind);
      };
      // Continuous recognition still ends itself — a long pause, a network
      // blip. Restart it, or the microphone stays open and deaf.
      rec.onend = () => {
        if (recRef.current === rec) {
          try {
            rec.start();
          } catch {
            /* already starting; the next onend will try again */
          }
        }
      };
      recRef.current = rec;
      rec.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stop();
    }
  }, [stop]);

  // A stable identity. The getter closes over a ref, so rebuilding it every
  // render changes nothing about what it returns — but any effect that lists
  // it as a dependency re-runs, and one of them builds a WebGL scene.
  const level = useCallback(() => levelRef.current, []);

  const suspend = useCallback((quiet: boolean) => {
    deafRef.current = quiet;
    // Only the transcript is dropped, not the audio: stopping the recogniser
    // here would fire onend, which restarts it, and the restart is what a
    // half-spoken word arrives during. Ignoring results is both simpler and
    // the thing that actually holds.
    if (quiet) setPartial("");
  }, []);

  useEffect(() => stop, [stop]);

  return {
    listening,
    level,
    partial,
    error,
    canTranscribe,
    start: () => void start(),
    stop,
    suspend,
  };
}
