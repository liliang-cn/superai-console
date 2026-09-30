import { useCallback, useEffect, useState } from "react";

// Night or day.
//
// The theme is an attribute on <html>, and every colour on the page is a
// variable that attribute redefines (index.css). The canvases — the orb, the
// hive stage — are told on a window event, because they paint with colours
// they read once rather than with CSS.
//
// The switch itself is the one big motion on this page: the browser takes a
// picture of the page in each theme, and the new one is revealed through a
// circle that grows out of the button, with a ring of light on its edge. With
// no View Transitions, or with reduced motion asked for, it simply changes.

export type Theme = "dark" | "light";

const KEY = "console.theme";
export const THEME_EVENT = "console-theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function system(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function apply(t: Theme) {
  const root = document.documentElement;
  root.dataset.theme = t;
  root.style.colorScheme = t;
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: t }));
}

/** Sets the theme before the first paint: a saved choice, else the system's. */
export function initTheme() {
  apply(stored() ?? system());
  // Until someone chooses, the system's setting is followed as it changes.
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (!stored()) apply(system());
  });
}

/** The current theme, kept up to date. */
export function useThemeValue(): Theme {
  const [t, setT] = useState<Theme>(currentTheme);
  useEffect(() => {
    const on = (e: Event) => setT((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  return t;
}

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type WithTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition };

export function useTheme() {
  const theme = useThemeValue();

  /** Switches, revealing the new theme from (x, y). */
  const toggle = useCallback((x: number, y: number) => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // A browser that will not store it still switches; it just forgets.
    }
    const doc = document as WithTransitions;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || still) {
      apply(next);
      return;
    }
    // Far enough to cover the farthest corner.
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const duration = 780;
    const easing = "cubic-bezier(0.22, 0.61, 0.12, 1)";
    let ring: HTMLDivElement | null = null;
    const vt = doc.startViewTransition(() => {
      apply(next);
      // The ring is part of the new page, so it rides inside the circle that
      // reveals it — a hair smaller, or the edge would clip it in half.
      ring = document.createElement("div");
      ring.className = "theme-ring";
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      document.body.appendChild(ring);
    });
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration, easing, pseudoElement: "::view-transition-new(root)" } as KeyframeAnimationOptions,
      );
      ring?.animate(
        [
          { width: "0px", height: "0px", opacity: 1 },
          { width: `${r * 1.96}px`, height: `${r * 1.96}px`, opacity: 0.2 },
        ],
        { duration, easing, fill: "forwards" },
      );
    });
    vt.finished.finally(() => ring?.remove());
  }, []);

  return { theme, toggle };
}
