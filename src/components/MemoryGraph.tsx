import { useEffect, useState } from "react";
import { rpc } from "../lib/api";

// The shape of what it knows.
//
// The feed below this says what the agent just did to its memory; this says
// what the memory *is*. They answer different questions and neither substitutes
// for the other — a recall that returned nothing looks identical in the feed
// whether the graph is empty or enormous.
//
// It is an iframe rather than a canvas because the view is CortexDB's own,
// served by the app on this origin at /graph. That path matters: the graph
// server listens on a loopback port the OS assigns afresh on every start, so
// nothing outside the app can address it directly — the app proxies it, and
// Caddy has to route /graph there too or the browser silently gets the SPA's
// index.html back and shows an empty frame with no error at all.

type GraphStatus = {
  url?: string;
  nodes?: number;
  edges?: number;
  source?: string;
  error?: string;
};

export function useGraph() {
  const [g, setG] = useState<GraphStatus | null>(null);
  useEffect(() => {
    let live = true;
    // Starting the view reads the whole brain, which against a shared one is a
    // network call — so it is asked for once, not polled. The picture inside
    // the frame keeps itself current.
    rpc<GraphStatus>("GraphView")
      .then((s) => live && setG(s))
      .catch((e) => live && setG({ error: String(e) }));
    return () => {
      live = false;
    };
  }, []);
  return g;
}

export default function MemoryGraph({ graph }: { graph: GraphStatus | null }) {
  if (graph?.error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[11px] leading-[1.6] text-sig-bad">
        {graph.error}
      </div>
    );
  }
  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] tracking-[0.2em] text-ink-3">
        …
      </div>
    );
  }
  return (
    <div className="relative h-full">
      <iframe
        // panels=0 hides the view's own chrome, which would be a second set of
        // controls inside a panel that already has a header. bg matches this
        // page so the frame has no visible edge.
        src="/graph/?panels=0&spin=4&bg=000000"
        title="CortexDB knowledge graph"
        className="h-full w-full border-0 transition-[filter] duration-500 [:root[data-theme=light]_&]:[filter:invert(0.9)_hue-rotate(180deg)_saturate(1.5)_brightness(1.02)]"
      />
      {/* Sits over the frame rather than under it: the graph fills its box, and
          a row beneath would cost height the picture needs more. */}
      <div className="pointer-events-none absolute bottom-2 left-4 right-4 flex justify-between text-[10px] text-ink-3">
        <span>{graph.source}</span>
        <span className="tabular-nums">
          {(graph.nodes ?? 0).toLocaleString()} nodes · {(graph.edges ?? 0).toLocaleString()} edges
        </span>
      </div>
    </div>
  );
}
