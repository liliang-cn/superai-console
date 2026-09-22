import { CardRegistry } from "@ai-gui/core";
import { primitives } from "@ai-gui/plugin-primitives";
import { katex } from "@ai-gui/plugin-katex";
import { mermaid } from "@ai-gui/plugin-mermaid";
import { chart } from "@ai-gui/plugin-chart";
import { citation } from "@ai-gui/plugin-citation";
import { bigscreen } from "@ai-gui/plugin-bigscreen";

// How an answer is drawn.
//
// The model does not write plain prose — it writes tables, formulae, diagrams
// and chart specs, and before this they arrived as fenced code the reader had
// to decode by eye. AIGUI is what the desktop app already renders answers
// with, so the same answer now looks the same in both places.
//
// The plugin set is deliberately smaller than the desktop's by one: `ui`,
// which renders declarative interfaces whose buttons call back into the app.
// Those actions are bound to the desktop's own RPCs, and a console button that
// silently did nothing would be worse than a code block that plainly is one.
//
// Nothing here renders tool calls or tool results, and that is AIGUI's own
// boundary rather than an omission: its input is the model's output and
// nothing else. The IN · OUT panel is where the tools already are.

export const registry = new CardRegistry();

export const plugins = [
  primitives(), // list / table / key-value / layout
  katex(), // $…$ and $$…$$
  mermaid(), // ```mermaid
  chart({ interactive: true }), // ```chart — ECharts options
  citation(), // ```sources
  bigscreen(), // ```bigscreen
];

/** This console is Chinese-first, like the app it watches. */
export const APP_LOCALE = "zh-CN";

/**
 * normalizeOneLineBlocks repairs a fence the model wrote on a single line.
 *
 * Models emit ```chart{...}``` often enough that treating it as malformed
 * would mean dropping a real chart on the floor. The desktop frontend carries
 * the same repair for the same reason; a fence has to start its own line for
 * the parser to see it.
 */
export function normalizeOneLineBlocks(text: string): string {
  if (!text.includes("```")) return text;
  return text.replace(/```([a-zA-Z][\w-]*)[ \t]*(\{|\[)/g, "```$1\n$2");
}
