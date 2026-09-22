import { useEffect, useRef } from "react";

/**
 * The microphone's level, under the orb.
 *
 * The orb alone cannot say whether it is moving because of you or because it
 * is breathing; a meter that sits at zero when the room is quiet can. It reads
 * the same getter the shader does.
 *
 * Nothing here is React state. The level changes sixty times a second, and
 * rendering a component that often — to move one bar — would cost more than
 * the shader it sits under. The width is written straight to the node.
 */
export default function LevelBar({ level, on }: { level: () => number; on: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!on) {
      if (fillRef.current) fillRef.current.style.width = "0%";
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = fillRef.current;
      if (el) el.style.width = `${Math.min(100, level() * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level, on]);

  return (
    <div
      className="h-[2px] w-[280px] max-w-full bg-white/10"
      role="meter"
      aria-label="Microphone level"
    >
      <div ref={fillRef} className="h-[2px] w-0 bg-sig-model" />
    </div>
  );
}
