"use client";

import { useEffect, useState } from "react";

// Client-only clock. Returns null until mounted: rendering Date.now() during
// SSR produces a server/client mismatch and a hydration error, so callers
// must treat null as "time unknown" rather than substituting a value.
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
