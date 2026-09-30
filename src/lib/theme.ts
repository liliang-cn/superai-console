import { useCallback, useEffect, useState } from "react";
import { applyPalette, revealFrom } from "./palette";

// Night or day.
//
// The theme is an attribute on <html>, and every colour on the page is a
// variable that attribute redefines (index.css) — or that the chosen palette
// sets on top (palette.ts). The canvases — the orb, the hive stage, the scope
// — are told on a window event, because they paint with colours they read
// rather than with CSS.
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
  // A palette has a value per theme, so it is put on again with the theme.
  applyPalette(t);
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

/** Changes whenever the theme or the palette does: a key for anything that
 *  reads its colours once, when it is built, and so has to be built again. */
export function useLookKey(): string {
  const read = () => `${currentTheme()}:${document.documentElement.dataset.palette ?? ""}`;
  const [k, setK] = useState(read);
  useEffect(() => {
    const on = () => setK(read());
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  return k;
}

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
    revealFrom(() => apply(next), x, y);
  }, []);

  return { theme, toggle };
}
