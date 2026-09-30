import { useTheme } from "../lib/theme";

/**
 * Night and day. A sun whose rays fold in while a shadow slides across it and
 * leaves a moon; the switch itself sweeps the page from this button.
 */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toggle(r.left + r.width / 2, r.top + r.height / 2);
      }}
      aria-label={light ? "Switch to the dark theme" : "Switch to the light theme"}
      title={light ? "Dark" : "Light"}
      className="grid h-8 w-8 shrink-0 place-items-center text-ink-2 transition-colors hover:text-sig-model focus-visible:outline focus-visible:outline-1 focus-visible:outline-sig-model"
    >
      <svg className="theme-glyph" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <mask id="theme-shade">
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle className="shade" cx={light ? 30 : 16} cy={light ? -6 : 8} r="7" fill="black" />
        </mask>
        <circle className="body" cx="12" cy="12" r={light ? 4.6 : 8} fill="currentColor" mask="url(#theme-shade)" />
        <g className="rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={12 + Math.cos(a) * 7.4}
                y1={12 + Math.sin(a) * 7.4}
                x2={12 + Math.cos(a) * 9.8}
                y2={12 + Math.sin(a) * 9.8}
              />
            );
          })}
        </g>
      </svg>
    </button>
  );
}
