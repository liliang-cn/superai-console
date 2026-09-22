import { useCallback, useEffect, useRef, useState } from "react";

// Where the panel edges sit.
//
// Three numbers describe the whole desktop grid: how wide the voice column is,
// how the remaining width splits between the two feeds, and how the height
// splits between the top row and the bottom. Everything else follows, so the
// dividers can be positioned from the same values that build the template and
// nothing has to be measured to draw them.
//
// Kept in localStorage because a layout someone dragged into shape and lost on
// reload is worse than one they could not drag at all.

const KEY = "console.layout.v1";

export type Layout = {
  /** Width of the voice column, in pixels. */
  voice: number;
  /** Share of the remaining width taken by the middle column, 0..1. */
  mid: number;
  /** Share of the height taken by the top row, 0..1. */
  top: number;
};

const DEFAULT: Layout = { voice: 500, mid: 0.5, top: 0.5 };

/** Nothing may be dragged away entirely: a panel collapsed to nothing cannot
 *  be dragged back, because the handle goes with it. */
const MIN_VOICE = 260;
const MAX_VOICE = 900;
const MIN_SHARE = 0.18;
const MAX_SHARE = 0.82;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function load(): Layout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const v = JSON.parse(raw) as Partial<Layout>;
    return {
      voice: clamp(Number(v.voice) || DEFAULT.voice, MIN_VOICE, MAX_VOICE),
      mid: clamp(Number(v.mid) || DEFAULT.mid, MIN_SHARE, MAX_SHARE),
      top: clamp(Number(v.top) || DEFAULT.top, MIN_SHARE, MAX_SHARE),
    };
  } catch {
    // Private windows, cleared site data, a value someone hand-edited. A
    // layout is not worth failing a page load over.
    return DEFAULT;
  }
}

export function useLayout() {
  const [layout, setLayout] = useState<Layout>(load);
  // Written on every pointer move during a drag, so it is debounced rather
  // than saved sixty times a second.
  const saveTimer = useRef(0);

  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(layout));
      } catch {
        /* see load() */
      }
    }, 300);
    return () => window.clearTimeout(saveTimer.current);
  }, [layout]);

  const reset = useCallback(() => setLayout(DEFAULT), []);

  /**
   * drag returns the pointerdown handler for one divider.
   *
   * Pointer capture rather than window listeners: the pointer leaves the 7px
   * handle on the first movement, and without capture the drag would end
   * there. Capture also means the release is delivered even if it happens
   * over the iframe in the memory panel, which would otherwise swallow it and
   * leave the divider stuck to the cursor.
   */
  const drag = useCallback(
    (which: keyof Layout) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const host = e.currentTarget.parentElement;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      e.currentTarget.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        setLayout((l) => {
          if (which === "voice") {
            return { ...l, voice: clamp(ev.clientX - rect.left, MIN_VOICE, MAX_VOICE) };
          }
          if (which === "mid") {
            const rest = rect.width - l.voice;
            if (rest <= 0) return l;
            return { ...l, mid: clamp((ev.clientX - rect.left - l.voice) / rest, MIN_SHARE, MAX_SHARE) };
          }
          return { ...l, top: clamp((ev.clientY - rect.top) / rect.height, MIN_SHARE, MAX_SHARE) };
        });
      };
      // Captured once, here. React nulls currentTarget on the synthetic event
      // as soon as the handler returns, so reading it again inside up — which
      // runs later, by definition — throws on every release.
      const el = e.currentTarget;
      const up = (ev: PointerEvent) => {
        el.releasePointerCapture?.(ev.pointerId);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [],
  );

  return { layout, drag, reset };
}
