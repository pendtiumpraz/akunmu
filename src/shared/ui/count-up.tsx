"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 700;

/**
 * A number that counts up to `value` the first time it shows (ease-out, 0.7 s), then follows changes at once.
 * People who prefer reduced motion see the value straight away.
 */
export function CountUp({ value, format = String }: { value: number; format?: (value: number) => string }) {
  const [shown, setShown] = useState(0);
  const counted = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (counted.current || reduced) {
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    counted.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}
