// The console's colours, chosen.
//
// Two axes, the way shadcn's themes have them: a base — the ground and the
// greys of the text — and an accent, the one colour that means "live". The
// default is the console's own: black and cyan. The bases are shadcn's
// (zinc, slate, stone, neutral) and so are the accents, taken from the
// Tailwind palettes they are built on; each has a night value and a day value.
//
// Nothing here is a guess about legibility. Every ink and every accent below
// was checked against the grounds it can sit on and clears 4.5:1 there; a
// colour of the reader's own choosing is pushed lighter or darker until it
// does too.
//
// A choice is applied as inline custom properties on <html>, which win over
// the stylesheet's defaults; choosing the defaults removes them again.

import { THEME_EVENT, currentTheme, type Theme } from "./theme";

export const BASES = {
  zinc: {
    dark: { ground: "#09090b", raise: "#18181b", ink0: "#fafafa", ink1: "#d4d4d8", ink2: "#a1a1aa", ink3: "#787881" },
    light: { ground: "#fafafa", raise: "#ffffff", ink0: "#09090b", ink1: "#27272a", ink2: "#52525b", ink3: "#71717a" },
  },
  slate: {
    dark: { ground: "#020617", raise: "#0f172a", ink0: "#f8fafc", ink1: "#cbd5e1", ink2: "#94a3b8", ink3: "#697990" },
    light: { ground: "#f8fafc", raise: "#ffffff", ink0: "#020617", ink1: "#1e293b", ink2: "#475569", ink3: "#64748b" },
  },
  stone: {
    dark: { ground: "#0c0a09", raise: "#1c1917", ink0: "#fafaf9", ink1: "#d6d3d1", ink2: "#a8a29e", ink3: "#7f7873" },
    light: { ground: "#fafaf9", raise: "#ffffff", ink0: "#0c0a09", ink1: "#292524", ink2: "#57534e", ink3: "#78716c" },
  },
  neutral: {
    dark: { ground: "#0a0a0a", raise: "#171717", ink0: "#fafafa", ink1: "#d4d4d4", ink2: "#a3a3a3", ink3: "#797979" },
    light: { ground: "#fafafa", raise: "#ffffff", ink0: "#0a0a0a", ink1: "#262626", ink2: "#525252", ink3: "#737373" },
  },
} as const;

export const ACCENTS = {
  blue: { dark: "#60a5fa", light: "#1d4ed8" },
  violet: { dark: "#a78bfa", light: "#7c3aed" },
  rose: { dark: "#fb7185", light: "#be123c" },
  red: { dark: "#f87171", light: "#b91c1c" },
  orange: { dark: "#fb923c", light: "#9a3412" },
  yellow: { dark: "#facc15", light: "#854d0e" },
  green: { dark: "#4ade80", light: "#166534" },
} as const;

export type BaseName = "black" | keyof typeof BASES;
export type AccentName = "cyan" | keyof typeof ACCENTS | "custom";
export type Palette = { base: BaseName; accent: AccentName; custom?: string };

export const DEFAULT_PALETTE: Palette = { base: "black", accent: "cyan" };

/** What each base looks like in a swatch: its family's middle grey, where
 *  the tint that tells them apart — cool, blue, warm, none — is plainest. */
export const BASE_SWATCH: Record<BaseName, string> = {
  black: "#000000",
  zinc: "#71717a",
  slate: "#64748b",
  stone: "#78716c",
  neutral: "#737373",
};
export const ACCENT_SWATCH: Record<Exclude<AccentName, "custom">, { dark: string; light: string }> = {
  cyan: { dark: "#5fd3e8", light: "#056f80" },
  ...ACCENTS,
};

const KEY = "console.palette";

export function loadPalette(): Palette {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null") as Palette | null;
    if (p && typeof p.base === "string" && typeof p.accent === "string") return p;
  } catch {
    // Unreadable is the same as unset.
  }
  return DEFAULT_PALETTE;
}

function savePalette(p: Palette) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not stored; still applied for this visit.
  }
}

// ---- colour arithmetic, just enough to keep a chosen colour legible ----

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function mix(a: string, b: string, t: number) {
  const A = rgb(a);
  const B = rgb(b);
  return (
    "#" +
    A.map((c, i) =>
      Math.round((c * (1 - t) + B[i] * t) * 255)
        .toString(16)
        .padStart(2, "0"),
    ).join("")
  );
}
/** c moved toward `toward` until it clears 4.5:1 against every ground. */
function legible(c: string, grounds: string[], toward: string) {
  let out = c;
  for (let t = 0; t <= 1 && grounds.some((g) => contrast(out, g) < 4.5); t += 0.02) out = mix(c, toward, t);
  return out;
}
const DARK_GROUNDS = ["#000000", ...Object.values(BASES).map((b) => b.dark.ground)];
const LIGHT_GROUNDS = ["#e9eeed", ...Object.values(BASES).map((b) => b.light.ground)];

/** The accent's value in a theme, a custom one made legible first. */
export function accentOf(p: Palette, theme: Theme): string | null {
  if (p.accent === "custom" && p.custom && /^#[0-9a-f]{6}$/i.test(p.custom)) {
    return theme === "dark" ? legible(p.custom, DARK_GROUNDS, "#ffffff") : legible(p.custom, LIGHT_GROUNDS, "#000000");
  }
  if (p.accent === "cyan" || p.accent === "custom") return null;
  return ACCENTS[p.accent][theme];
}

const VARS = [
  "--color-ground",
  "--color-ground-raise",
  "--color-ink-0",
  "--color-ink-1",
  "--color-ink-2",
  "--color-ink-3",
  "--color-rule",
  "--color-rule-soft",
  "--color-line",
  "--color-line-strong",
  "--color-sig-model",
  "--color-orb-cold",
  "--color-orb-hot",
];

/** The custom properties a palette sets in a theme; empty for the defaults. */
export function paletteVars(p: Palette, theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.base !== "black" && p.base in BASES) {
    const b = BASES[p.base as keyof typeof BASES][theme];
    const day = theme === "light";
    Object.assign(out, {
      "--color-ground": b.ground,
      "--color-ground-raise": b.raise,
      "--color-ink-0": b.ink0,
      "--color-ink-1": b.ink1,
      "--color-ink-2": b.ink2,
      "--color-ink-3": b.ink3,
      // Hairlines are the text colour, thinned: they belong to the base.
      "--color-rule": `color-mix(in srgb, ${b.ink0} ${day ? 12 : 10}%, transparent)`,
      "--color-rule-soft": `color-mix(in srgb, ${b.ink0} ${day ? 7 : 7}%, transparent)`,
      "--color-line": `color-mix(in srgb, ${b.ink0} ${day ? 17 : 12}%, transparent)`,
      "--color-line-strong": `color-mix(in srgb, ${b.ink0} ${day ? 28 : 20}%, transparent)`,
    });
  }
  const accent = accentOf(p, theme);
  if (accent) {
    out["--color-sig-model"] = accent;
    // The orb burns in the accent, and cools toward the base's grey.
    out["--color-orb-hot"] = accent;
    out["--color-orb-cold"] = mix(accent, theme === "dark" ? "#6b7280" : "#374151", 0.55);
  }
  return out;
}

/** Puts the saved palette on the page, for the current theme. */
export function applyPalette(theme: Theme = currentTheme()) {
  const root = document.documentElement;
  const p = loadPalette();
  for (const v of VARS) root.style.removeProperty(v);
  for (const [k, v] of Object.entries(paletteVars(p, theme))) root.style.setProperty(k, v);
  root.dataset.palette = `${p.base}-${p.accent}${p.accent === "custom" ? p.custom : ""}`;
}

/** Chooses a palette, revealed from (x, y) the way a theme switch is. */
export function choosePalette(p: Palette, x?: number, y?: number) {
  savePalette(p);
  const update = () => {
    applyPalette();
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: currentTheme() }));
  };
  revealFrom(update, x, y);
}

// The reveal is shared with the theme switch; it lives here to avoid a cycle.
type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type WithTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition };

export function revealFrom(update: () => void, x?: number, y?: number) {
  const doc = document as WithTransitions;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || still || x === undefined || y === undefined) {
    update();
    return;
  }
  // Far enough to cover the farthest corner.
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const duration = 780;
  const easing = "cubic-bezier(0.22, 0.61, 0.12, 1)";
  let ring: HTMLDivElement | null = null;
  const vt = doc.startViewTransition(() => {
    update();
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
}
