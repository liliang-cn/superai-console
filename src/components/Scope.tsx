import { useEffect, useRef } from "react";
import type { Meter } from "../lib/api";

/**
 * The agent's pulse, as a scope trace.
 *
 * A carrier that barely moves when nothing is happening and swings when events
 * arrive: every event on the stream kicks the amplitude, which then decays, and
 * runs in flight hold it up. It scrolls right to left, so the last few seconds
 * are always on screen and a burst of tool calls reads as a burst.
 *
 * Drawn on a canvas at 60 fps from a ref, so a stream of frames never becomes
 * a stream of React renders.
 */
export default function Scope({ meter }: { meter: Meter | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef(meter);
  meterRef.current = meter;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const STEP = 2.5; // px between samples
    const buf: number[] = [];
    let lastSeq = -1;
    let energy = 0;
    let phase = 0;
    let raf = 0;
    let colours = { line: "", dim: "", day: false };
    const readColours = () => {
      const css = getComputedStyle(document.documentElement);
      colours = {
        line: css.getPropertyValue("--color-sig-model").trim() || "#5fd3e8",
        dim: css.getPropertyValue("--color-rule").trim() || "rgba(255,255,255,0.1)",
        day: document.documentElement.dataset.theme === "light",
      };
    };
    readColours();
    window.addEventListener("console-theme", readColours);

    const frame = () => {
      const m = meterRef.current;
      // New events since the last frame kick the trace.
      if (m && m.events.length) {
        const top = m.events[m.events.length - 1].seq;
        if (lastSeq >= 0 && top > lastSeq) energy = Math.min(1, energy + (top - lastSeq) * 0.3);
        lastSeq = top;
      }
      const hold = m ? Math.min(0.5, m.runs.length * 0.18) + (m.live ? 0.05 : 0) : 0;
      energy = Math.max(hold, energy * 0.965);

      const n = Math.ceil(w / STEP) + 1;
      phase += 0.55 + energy * 0.9;
      const amp = 0.06 + energy * 0.85;
      const v = Math.sin(phase) * amp * (0.75 + 0.25 * Math.sin(phase * 0.13)) + (Math.random() - 0.5) * energy * 0.35;
      buf.push(still ? 0 : v);
      while (buf.length > n) buf.shift();

      ctx.clearRect(0, 0, w, h);
      const mid = h / 2;
      // The graticule's centre line.
      ctx.strokeStyle = colours.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(w, mid + 0.5);
      ctx.stroke();

      if (buf.length > 1) {
        // Older samples fade out to the left, as phosphor does.
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(0.35, colours.line);
        grad.addColorStop(1, colours.line);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.lineJoin = "round";
        ctx.shadowColor = colours.line;
        ctx.shadowBlur = colours.day ? 0 : 8;
        ctx.beginPath();
        const x0 = w - (buf.length - 1) * STEP;
        buf.forEach((s, i) => {
          const x = x0 + i * STEP;
          const y = mid - s * (h / 2 - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // The write head.
        const y = mid - buf[buf.length - 1] * (h / 2 - 2);
        ctx.fillStyle = colours.line;
        ctx.shadowBlur = colours.day ? 4 : 14;
        ctx.beginPath();
        ctx.arc(w - 1.5, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("console-theme", readColours);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-7 w-full max-w-[420px]" aria-hidden="true" />;
}
