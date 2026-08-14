"use client";

import { useEffect, useState } from "react";

// Client-only clocks. All of these return null until mounted: rendering
// Date.now() during SSR produces a server/client mismatch and a hydration
// error, so callers must treat null as "time unknown" rather than
// substituting a value.

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

// ---------------------------------------------------------------- countdowns

// One interval for the whole app, however many countdowns are on screen -
// a page of 24 market cards must not run 24 timers.
type Listener = () => void;
const listeners = new Set<Listener>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribeToTick(listener: Listener): () => void {
  listeners.add(listener);
  if (!ticker) {
    ticker = setInterval(() => {
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

export type CountdownLevel = "normal" | "urgent" | "critical" | "closed";

export interface Countdown {
  text: string;
  level: CountdownLevel;
  secondsLeft: number;
}

// Precision follows urgency: days and hours read as a date, but the last
// hour reads as a clock, because that is when the difference between "soon"
// and "42 seconds" changes what a trader does.
export function formatCountdown(secondsLeft: number): Countdown {
  if (secondsLeft <= 0) {
    return { text: "CLOSED", level: "closed", secondsLeft: 0 };
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  if (secondsLeft < 3600) {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return {
      text: `CLOSES IN ${pad(m)}:${pad(s)}`,
      level: secondsLeft < 300 ? "critical" : "urgent",
      secondsLeft,
    };
  }

  if (secondsLeft < 86_400) {
    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    return { text: `CLOSES IN ${h}H ${m}M`, level: "normal", secondsLeft };
  }

  const d = Math.floor(secondsLeft / 86_400);
  const h = Math.floor((secondsLeft % 86_400) / 3600);
  return { text: `CLOSES IN ${d}D ${h}H`, level: "normal", secondsLeft };
}

// Ticks every second but only re-renders when the rendered text actually
// changes - a market closing in six days repaints once an hour, not 3600
// times.
export function useCountdown(endTime: number): Countdown | null {
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    const compute = () =>
      formatCountdown(endTime - Math.floor(Date.now() / 1000));
    setCountdown(compute());
    return subscribeToTick(() => {
      setCountdown((prev) => {
        const next = compute();
        // Returning the previous object lets React bail out of the render.
        return prev && prev.text === next.text && prev.level === next.level
          ? prev
          : next;
      });
    });
  }, [endTime]);

  return countdown;
}
