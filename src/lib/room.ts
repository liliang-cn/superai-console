import { useEffect, useState } from "react";

/**
 * Is this a phone?
 *
 * A media query rather than a resize listener: the browser already knows the
 * answer and only tells us when it changes, so nothing runs while a window is
 * being dragged.
 *
 * 900px, not a device width. The console's layout needs room for a 500px orb
 * column beside two feeds; below that the three feeds stop being three feeds
 * whatever the machine is called.
 */
const PHONE = "(max-width: 900px)";

export function usePhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia(PHONE).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches);
    mq.addEventListener("change", onChange);
    setPhone(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
}
