// In-process store behind the AGENT OPS console. The VPS agents POST into it
// via /api/agent-log; the co-pilot's intent route records into it directly
// (same process). Kept on globalThis so it survives dev hot-reload; on
// multi-instance serverless hosts the feed is per-instance - it is designed
// for a single-server/VPS deployment.

export interface OpsEvent {
  id: number;
  ts: number;
  agent: string;
  action: string;
  detail: string;
}

const MAX_EVENTS = 100;

const g = globalThis as unknown as {
  __aetheriaOps?: { seq: number; events: OpsEvent[] };
};
g.__aetheriaOps ??= { seq: 0, events: [] };
const store = g.__aetheriaOps;

export function recordOps(agent: string, action: string, detail = ""): number {
  const a = String(agent).slice(0, 24).trim();
  const act = String(action).slice(0, 40).trim();
  if (!a || !act) return store.seq;
  store.events.push({
    id: ++store.seq,
    ts: Date.now(),
    agent: a,
    action: act,
    detail: String(detail).slice(0, 200).trim(),
  });
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }
  return store.seq;
}

export function readOps(since = 0): OpsEvent[] {
  return Number.isFinite(since) && since > 0
    ? store.events.filter((e) => e.id > since)
    : [...store.events];
}

export function currentSeq(): number {
  return store.seq;
}
