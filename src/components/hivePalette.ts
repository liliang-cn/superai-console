// The colours the hive stages draw with.
//
// The console has one ground and five signal colours, so the stage borrows them
// rather than bringing its own: cyan is "live", amber is a tool, the teal of the
// orb's hot end is a result that came back well. This file is the one thing the
// two hive stages do not share between the desktop app and the console.
export function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
  return {
    light: false,
    accent: v("--color-sig-model", "#5fd3e8"),
    green: v("--color-orb-hot", "#7fe3d0"),
    red: v("--color-sig-bad", "#f0687f"),
    amber: v("--color-sig-tool", "#e8b366"),
    // Messages between members. None of the five signals means "a note passed
    // along", so this one is its own.
    mail: "#b18cff",
    dim: v("--color-ink-2", "#8a9ba3"),
    text: v("--color-ink-0", "#e6edf0"),
    border: v("--color-rule", "rgba(255,255,255,0.1)"),
    panel: "#000000",
    glow: 1,
  };
}
export type Palette = ReturnType<typeof palette>;
