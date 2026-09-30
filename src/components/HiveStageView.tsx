import { forwardRef, lazy, Suspense, useImperativeHandle, useRef, useState } from "react";
import HiveStage from "./HiveStage";
import type { StageHandle, StageTask, StageWorker } from "./HiveStage";

// The hive stage, flat or in three dimensions.
//
// The three.js one is loaded only when asked for: it is most of a megabyte, and
// a console that is never switched to 3D should not pay for it.
const HiveStage3D = lazy(() => import("./HiveStage3D"));

const KEY = "console.hive.stage";

type Mode = "2d" | "3d";

// Asked once, for the whole page, and the context it makes is let go at once.
// It used to be asked on every render, and each answer was a new WebGL context:
// a browser gives a page about sixteen, and the orb, the memory graph and the 3D
// stage all want theirs, so a few seconds of re-rendering left them blank.
let webglAnswer: boolean | null = null;
function webgl(): boolean {
  if (webglAnswer !== null) return webglAnswer;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    webglAnswer = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglAnswer = false;
  }
  return webglAnswer;
}

function initial(can3d: boolean): Mode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "2d") return "2d";
    if (v === "3d" && can3d) return "3d";
  } catch {
    /* storage can be unavailable; the default below is fine */
  }
  return can3d ? "3d" : "2d";
}

interface Props {
  role: "" | "queen" | "worker";
  self: string;
  workers: StageWorker[];
  tasks: StageTask[];
  ready: boolean;
}

const HiveStageView = forwardRef<StageHandle, Props>(function HiveStageView(props, ref) {
  const can3d = webgl();
  const [mode, setMode] = useState<Mode>(() => initial(can3d));
  const child = useRef<StageHandle>(null);
  useImperativeHandle(ref, () => ({ pulse: (p) => child.current?.pulse(p) }), []);

  const pick = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* not worth failing over */
    }
  };

  return (
    <div className="relative h-full w-full">
      {mode === "3d" ? (
        <Suspense fallback={null}>
          <HiveStage3D ref={child} {...props} />
        </Suspense>
      ) : (
        <HiveStage ref={child} {...props} />
      )}
      {can3d ? (
        <div className="absolute right-3 top-2 z-10 flex text-[10px] font-semibold tracking-[0.16em]" role="group" aria-label="Stage view">
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => pick(m)}
              className={`px-2 py-0.5 transition-colors ${mode === m ? "text-sig-model" : "text-ink-3 hover:text-ink-0"}`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default HiveStageView;
