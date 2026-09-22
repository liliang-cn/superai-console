import { useMemo } from "react";
import { AIRenderer } from "@ai-gui/react";
import type { Meter } from "../lib/api";
import { APP_LOCALE, plugins, registry } from "../lib/aigui";

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

export default function Meters({ meter }: { meter: Meter | null }) {
  const block = useMemo(() => {
    if (!meter) return null;

    // Where the work actually went. Zero-valued rows are dropped rather than
    // drawn flat: a rank chart of six empty bars says less than three real
    // ones, and an idle agent should look idle.
    const items = [
      { name: "tool calls", value: meter.calls },
      { name: "memory", value: meter.memory },
      { name: "mcp", value: meter.mcp },
      { name: "shell", value: meter.shells },
      { name: "file reads", value: meter.reads },
      { name: "file writes", value: meter.writes },
    ].filter((i) => i.value > 0);

    // height is given explicitly because this is a strip under a live task,
    // not a wall on its own screen. Left to itself each panel takes about
    // 110px and the second one lands below the panel's bottom edge — clipped,
    // with nothing to say it was.
    //
    // 80 is the plugin's floor, not a preference: below it the block renders
    // as the words "panels[0].height must be from 80 to 900 pixels" and
    // nothing else.
    // One panel, not three.
    //
    // The first version put a tokens KPI and a cached KPI above this bar. In a
    // 490px column bigscreen stacked all three instead of sharing a row, and
    // the wall came to 529px inside a panel with 250 — it hung 113px out the
    // bottom. The two numbers were duplicates anyway: total tokens is already
    // in this panel's neighbour's header and in the status bar. What was not
    // shown anywhere is the shape of the work, which is this.
    if (!items.length) return null;
    const panels: unknown[] = [
      {
        kind: "rank",
        title: label("where the work went"),
        span: 12,
        height: Math.max(MIN_PANEL, 34 + items.length * 22),
        items,
      },
    ];

    return "```bigscreen\n" + JSON.stringify({ theme: "dark", columns: 12, panels }) + "\n```";
  }, [meter]);

  if (!block) return null;
  return (
    <div className="ai-meters px-4 pb-3">
      <AIRenderer text={block} registry={registry} plugins={plugins} theme="dark" locale={APP_LOCALE} />
    </div>
  );
}
