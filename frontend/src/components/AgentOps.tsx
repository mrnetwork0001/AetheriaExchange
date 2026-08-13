"use client";

// AGENT OPS - the live console for the venue's four AI agents. The VPS-side
// agents (market maker, pulse drafter, resolver) POST their decisions to
// /api/agent-log; the in-page co-pilot's intent engine records directly. This
// panel polls the feed and renders it as a terminal, plus a roster with
// online status per agent.

import { useEffect, useRef, useState } from "react";

export interface OpsEvent {
  id: number;
  ts: number;
  agent: string;
  action: string;
  detail: string;
}

const POLL_MS = 8000;
const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEEP = 100;

const ROSTER = [
  {
    key: "copilot",
    name: "CO-PILOT",
    verb: "TRADES",
    desc: "intent engine - runs in this page",
    always: true,
  },
  {
    key: "market-maker",
    name: "MARKET MAKER",
    verb: "MAKES",
    desc: "seeds + tops up two-sided depth",
    always: false,
  },
  {
    key: "pulse-drafter",
    name: "PULSE DRAFTER",
    verb: "CREATES",
    desc: "drafts + deploys daily markets",
    always: false,
  },
  {
    key: "resolver",
    name: "RESOLVER",
    verb: "SETTLES",
    desc: "data-checked settlement passes",
    always: false,
  },
];

export function useAgentOps() {
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [now, setNow] = useState(0);
  const sinceRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      // A poll slower than the interval must not overlap the next one -
      // overlapping requests would append the same events twice.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch(`/api/agent-log?since=${sinceRef.current}`);
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        // Server restarted (its seq is behind our cursor): resync from zero
        // instead of freezing on a stale cursor forever.
        if (typeof j.seq === "number" && j.seq < sinceRef.current) {
          sinceRef.current = 0;
          setEvents([]);
          return;
        }
        if (Array.isArray(j.events) && j.events.length > 0) {
          sinceRef.current = j.events[j.events.length - 1].id;
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const fresh = j.events.filter((e: OpsEvent) => !seen.has(e.id));
            return [...prev, ...fresh].slice(-MAX_KEEP);
          });
        }
        // Online-status math uses the SERVER's clock (events are stamped
        // with it) - a skewed device clock must not mark the fleet offline.
        if (typeof j.now === "number") setNow(j.now);
      } catch {
        // feed is best-effort
      } finally {
        inFlightRef.current = false;
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Latest event per agent decides its status; "offline" is a terminal
  // report, not a heartbeat gap.
  const lastByAgent = new Map<string, OpsEvent>();
  for (const e of events) lastByAgent.set(e.agent, e);

  const isOnline = (key: string, always: boolean) => {
    if (always) return true;
    const last = lastByAgent.get(key);
    return (
      !!last && last.action !== "offline" && now - last.ts < ONLINE_WINDOW_MS
    );
  };

  const onlineCount = ROSTER.filter((a) => isOnline(a.key, a.always)).length;

  return { events, now, lastByAgent, isOnline, onlineCount };
}

function clock(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function rel(ms: number) {
  if (ms < 60_000) return "JUST NOW";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}M AGO`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}H AGO`;
  return `${Math.floor(ms / 86_400_000)}D AGO`;
}

export function AgentOpsPanel({
  ops,
}: {
  ops: ReturnType<typeof useAgentOps>;
}) {
  const { events, now, lastByAgent, isOnline } = ops;
  const feedRef = useRef<HTMLDivElement>(null);

  // Keyed on the newest event id, not length - once the ring buffer is full,
  // length stops changing but new lines still arrive.
  const lastId = events.length > 0 ? events[events.length - 1].id : 0;
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div className="ops-wrap">
      <div className="ops-roster">
        {ROSTER.map((a) => {
          const online = isOnline(a.key, a.always);
          const last = lastByAgent.get(a.key);
          const status = online
            ? "ONLINE"
            : last
              ? `LAST ${rel(Math.max(0, now - last.ts))}`
              : "STANDBY";
          return (
            <div key={a.key} className="ops-agent">
              <div className="ops-agent-top">
                <span className={`ops-dot ${online ? "on" : ""}`} />
                <span className="ops-agent-name">{a.name}</span>
              </div>
              <span className="ops-agent-verb">{a.verb}</span>
              <span className="ops-agent-desc">{a.desc}</span>
              <span className={`ops-agent-status ${online ? "on" : ""}`}>
                {status}
              </span>
            </div>
          );
        })}
      </div>

      <div className="ops-feed" ref={feedRef}>
        {events.length === 0 ? (
          <div className="ops-empty">
            <span className="label">AWAITING AGENT REPORTS</span>
            <p>
              The autonomous agents post every decision here as they work -
              liquidity seeded, markets drafted, settlements checked. The
              co-pilot reports from this page; the fleet reports from wherever
              it runs.
            </p>
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="ops-line">
              <span className="ops-time">{clock(e.ts)}</span>
              <span className={`ops-tag ops-tag-${e.agent}`}>
                {e.agent.toUpperCase()}
              </span>
              <span className="ops-action">{e.action.toUpperCase()}</span>
              {e.detail && <span className="ops-detail">{e.detail}</span>}
            </div>
          ))
        )}
      </div>

      <p className="ops-note">
        EVERY STAKE, DEPLOY AND SETTLEMENT ABOVE IS A REAL ONCHAIN ACTION -
        CROSS-CHECK IT IN THE ACTIVITY TICKER.
      </p>
    </div>
  );
}
