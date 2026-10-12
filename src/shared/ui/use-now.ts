"use client";

import { useEffect, useState } from "react";

/**
 * Current time for client components, refreshed every `intervalMs`. Null during the first render, so the
 * server and client markup match and render code stays pure (no Date.now() while rendering).
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
