import { useEffect, useRef, useState, type ReactNode } from "react";

// The small moving parts: text that decodes into place, numbers that roll to
// their new value, and a panel edge that lights when something lands in it.

const still = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// What a character is before it settles: block and line glyphs, the texture
// of a signal not yet locked.
const NOISE = "▖▘▝▗▚▞▌▐▀▄░▒▓<>/\\|=+*#01";

/**
 * Text that arrives the way a decoded signal does: each character flickers
 * through noise and locks, left to right. Runs on mount and whenever the text
 * changes; spaces lock at once so the shape of the words is there from the
 * start.
 */
export function Decode({
  text,
  delay = 0,
  step = 34,
  className,
}: {
  text: string;
  /** ms before the first character starts. */
  delay?: number;
  /** ms between one character locking and the next. */
  step?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(() => (still() ? text : text.replace(/\S/g, " ")));
  useEffect(() => {
    if (still()) {
      setShown(text);
      return;
    }
    const t0 = performance.now() + delay;
    const chars = [...text];
    let raf = 0;
    const frame = (now: number) => {
      let done = true;
      const out = chars.map((c, i) => {
        if (c === " ") return c;
        const lock = t0 + i * step + 140;
        if (now >= lock) return c;
        done = false;
        if (now < t0 + i * step * 0.4) return " ";
        return NOISE[(Math.random() * NOISE.length) | 0];
      });
      setShown(out.join(""));
      if (!done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, step]);
  // The real text for anything reading the page, the flicker only for eyes.
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}

/**
 * A number that rolls to its new value instead of jumping, so a change is
 * seen as a change. format turns the in-between values into text.
 */
export function Roll({
  value,
  format = (v) => Math.round(v).toLocaleString(),
  ms = 650,
}: {
  value: number;
  format?: (v: number) => string;
  ms?: number;
}) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  const cur = useRef(value);
  useEffect(() => {
    if (still() || !Number.isFinite(value)) {
      cur.current = value;
      setV(value);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (value - from.current) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{format(v)}</span>;
}

/**
 * A slug of light across the top edge of whatever contains it, each time
 * `on` changes — not on the first render, which is not an event.
 */
export function Sweep({ on, color }: { on: unknown; color?: string }) {
  const [n, setN] = useState(0);
  // Data arriving for the first time — nothing, then the first count — is the
  // page loading, not an event, and does not sweep.
  const prev = useRef<unknown>(on);
  useEffect(() => {
    const was = prev.current;
    prev.current = on;
    if (was === on || was === undefined || was === null) return;
    setN((k) => k + 1);
  }, [on]);
  const [done, setDone] = useState(0);
  if (n === 0 || done === n) return null;
  const style = color ? ({ "--sweep": color } as React.CSSProperties) : undefined;
  return (
    // Gone once it has played. A slug left behind at the end of its run sits
    // past the panel's right edge, and on the last column that made the whole
    // page wider than the window — scrollable sideways, for good, after one
    // event.
    <span key={n} aria-hidden="true" style={style} onAnimationEnd={(e) => e.target === e.currentTarget.lastElementChild && setDone(n)}>
      {/* The slug runs inside a strip that clips it to the panel. */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-3 overflow-hidden">
        <span className="panel-sweep" />
      </span>
      <span className="panel-flash tl" />
      <span className="panel-flash tr" />
      <span className="panel-flash bl" />
      <span className="panel-flash br" />
    </span>
  );
}

export type { ReactNode };
