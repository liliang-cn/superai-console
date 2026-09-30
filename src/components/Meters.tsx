import { useEffect, useMemo, useRef, useState } from "react";
import { AIRenderer } from "@ai-gui/react";
import type { Meter } from "../lib/api";
import { APP_LOCALE, plugins, registry } from "../lib/aigui";
import { useThemeValue } from "../lib/theme";

// The numbers, drawn by the same engine that draws the answers.
//
// AIGUI's renderer takes model output and nothing else — that boundary is the
// library's, and it is not broken here. This composes a bigscreen block from
// telemetry the host already holds and hands it over as text, which is the
// plugin's own protocol. The README's rule is about a model inventing figures
// to make a wall look like evidence; every figure below came off the wire.

/** The shortest panel the plugin will draw. */
const MIN_PANEL = 80;

/** Bigscreen rejects a panel whose label runs long — and a rejected panel takes
 *  the whole block with it, silently. The caps are the plugin's: label 40,
 *  unit 16, prefix 8. Nothing here is near them, and this keeps it that way. */
function label(s: string): string {
  return s.length <= 40 ? s : s.slice(0, 39) + "…";
}

/**
 * useSlow throttles the meter.
 *
 * The stream pushes several frames a second, and this block is a string the
 * renderer reparses whenever it changes — an ECharts option rebuilt sixty
 * times a minute is both wasted work and a chart that never finishes an
 * animation. Once a second is faster than anyone reads a bar chart.
 */
function useSlow(meter: Meter | null, ms = 1000): Meter | null {
  const [slow, setSlow] = useState(meter);
  const latest = useRef(meter);
  latest.current = meter;
  useEffect(() => {
    const t = setInterval(() => setSlow(latest.current), ms);
    return () => clearInterval(t);
  }, [ms]);
  // The first frame should not wait a second to appear.
  useEffect(() => {
    setSlow((s) => s ?? latest.current);
  }, [meter]);
  return slow;
}

// Columns that have a signal colour take it from the theme; the three that do
// not have their own pair, the day one dark enough to read on a light ground.
const EXTRA = {
  shell: { dark: "#b98ee8", light: "#7a4fc0" },
  reads: { dark: "#6fd3a8", light: "#1f8a5c" },
  writes: { dark: "#e88ea8", light: "#b2426a" },
};

export default function Meters({ meter }: { meter: Meter | null }) {
  const slow = useSlow(meter);
  const theme = useThemeValue();

  const block = useMemo(() => {
    if (!slow) return null;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();

    const rows = [
      { name: "tools", value: slow.calls, color: v("--color-sig-tool") },
      { name: "memory", value: slow.memory, color: v("--color-sig-model") },
      { name: "mcp", value: slow.mcp, color: v("--color-sig-think") },
      { name: "shell", value: slow.shells, color: EXTRA.shell[theme] },
      { name: "reads", value: slow.reads, color: EXTRA.reads[theme] },
      { name: "writes", value: slow.writes, color: EXTRA.writes[theme] },
      { name: "failed", value: slow.fails, color: v("--color-sig-bad") },
    ];
    // Every column stays, including the empty ones, and the panel stays even
    // when all of them are. A chart whose categories come and go as work
    // happens is one whose axis moves under the reader; a panel that vanishes
    // when the agent goes quiet reads as broken rather than as idle. A flat
    // axis says "nothing is happening", which is a thing worth saying — and
    // the window is only a few minutes long, so quiet is the normal state.

    const option = {
      grid: { left: 6, right: 6, top: 18, bottom: 22, containLabel: true },
      // Update animation is the point of this panel: the columns grow as the
      // numbers do rather than being redrawn from zero each time.
      animationDurationUpdate: 600,
      animationEasingUpdate: "cubicOut",
      xAxis: {
        type: "category",
        data: rows.map((r) => r.name),
        axisLabel: { fontSize: 10, color: v("--color-ink-2"), interval: 0 },
        axisLine: { lineStyle: { color: v("--color-line") } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { fontSize: 10, color: v("--color-ink-3") },
        splitLine: { lineStyle: { color: v("--color-rule-soft") } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 26,
          data: rows.map((r) => ({ value: r.value, itemStyle: { color: r.color, borderRadius: [2, 2, 0, 0] } })),
          label: { show: true, position: "top", fontSize: 10, color: v("--color-ink-1") },
        },
      ],
    };

    return (
      "```bigscreen\n" +
      JSON.stringify({
        theme,
        columns: 12,
        panels: [{ kind: "chart", title: label("where the work went"), span: 12, height: MIN_PANEL + 80, option }],
      }) +
      "\n```"
    );
  }, [slow, theme]);

  if (!block) return null;
  return (
    <div className="ai-meters px-4 pb-3">
      <AIRenderer text={block} registry={registry} plugins={plugins} theme={theme} locale={APP_LOCALE} />
    </div>
  );
}
