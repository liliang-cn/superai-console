import { useEffect, useRef, useState } from "react";
import {
  ACCENT_SWATCH,
  BASE_SWATCH,
  DEFAULT_PALETTE,
  accentOf,
  choosePalette,
  loadPalette,
  type AccentName,
  type BaseName,
  type Palette,
} from "../lib/palette";
import { useLookKey, useThemeValue } from "../lib/theme";

const BASES: BaseName[] = ["black", "zinc", "slate", "stone", "neutral"];
const ACCENTS: Exclude<AccentName, "custom">[] = ["cyan", "blue", "violet", "rose", "red", "orange", "yellow", "green"];

const title = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * The console's colours: a base and an accent, shadcn's way. Each choice is
 * revealed from the swatch that made it, the same circle the theme switch
 * draws, so the change is seen arriving rather than just being different.
 */
export default function PalettePicker() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<Palette>(loadPalette);
  const theme = useThemeValue();
  useLookKey(); // re-render with the page when the theme or palette changes
  const box = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else, and on Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (next: Palette, e?: React.MouseEvent) => {
    setP(next);
    if (e) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      choosePalette(next, r.left + r.width / 2, r.top + r.height / 2);
    } else {
      choosePalette(next);
    }
  };

  const customShown = accentOf({ ...p, accent: "custom", custom: p.custom ?? "#22d3ee" }, theme) ?? "#22d3ee";
  const swatch = "relative grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-sig-model";
  const chosen = "ring-1 ring-ink-0 ring-offset-2 ring-offset-ground-raise";

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Colours"
        title="Colours"
        className="grid h-8 w-8 shrink-0 place-items-center text-ink-2 transition-colors hover:text-sig-model focus-visible:outline focus-visible:outline-1 focus-visible:outline-sig-model"
      >
        {/* Three drops of the current colours: the accent over the ground's ink. */}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8.5" r="5" fill="var(--color-sig-model)" />
          <circle cx="8" cy="15" r="5" fill="var(--color-sig-tool)" opacity="0.9" />
          <circle cx="16" cy="15" r="5" fill="var(--color-mail)" opacity="0.85" />
        </svg>
      </button>

      <div
        role="dialog"
        aria-label="Colours"
        className={`absolute right-0 top-10 z-50 w-[264px] origin-top-right border border-line bg-ground-raise p-4 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.45)] transition duration-200 ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <p className="mb-2.5 text-[11px] text-ink-2">Base</p>
        <div className="mb-4 flex justify-between">
          {BASES.map((b) => (
            <div key={b} className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label={`Base: ${title(b)}`}
                aria-pressed={p.base === b}
                onClick={(e) => pick({ ...p, base: b }, e)}
                className={`${swatch} border border-line-strong ${p.base === b ? chosen : ""}`}
                style={{ background: BASE_SWATCH[b] }}
              />
              <span className={`text-[10px] ${p.base === b ? "text-ink-0" : "text-ink-3"}`}>{title(b)}</span>
            </div>
          ))}
        </div>

        <p className="mb-2.5 text-[11px] text-ink-2">Accent</p>
        <div className="grid grid-cols-5 gap-2.5">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              title={title(a)}
              aria-label={`Accent: ${title(a)}`}
              aria-pressed={p.accent === a}
              onClick={(e) => pick({ ...p, accent: a }, e)}
              className={`${swatch} ${p.accent === a ? chosen : ""}`}
              style={{ background: ACCENT_SWATCH[a][theme] }}
            />
          ))}
          {/* Any colour. What is shown is what will be used: the chosen colour
              after it has been made legible on this theme's ground. */}
          <label
            title="Your own colour"
            className={`${swatch} cursor-pointer overflow-hidden ${p.accent === "custom" ? chosen : ""}`}
            style={{ background: `conic-gradient(from 90deg, ${customShown}, #f472b6, #facc15, #4ade80, #60a5fa, ${customShown})` }}
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-ground-raise text-[11px] leading-none text-ink-0">+</span>
            <input
              type="color"
              aria-label="Your own accent colour"
              value={p.custom ?? "#22d3ee"}
              onChange={(e) => pick({ ...p, accent: "custom", custom: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-rule pt-3 text-[11px]">
          <span className="text-ink-3">
            {title(p.base)} · {p.accent === "custom" ? p.custom : title(p.accent)}
          </span>
          <button
            type="button"
            onClick={(e) => pick(DEFAULT_PALETTE, e)}
            disabled={p.base === DEFAULT_PALETTE.base && p.accent === DEFAULT_PALETTE.accent}
            className="text-ink-2 transition-colors hover:text-sig-model disabled:opacity-40 disabled:hover:text-ink-2"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
