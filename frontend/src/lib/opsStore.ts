// Store behind the AGENT OPS console. The VPS agents POST into it via
// /api/agent-log; the co-pilot's intent route records into it directly.
//
// Two backends. With Upstash configured (the hosted setup) the feed lives in
// Redis, so agents writing to one serverless instance and judges polling
// another see the same events - without it the console would look
// permanently empty on any multi-instance host. Without Upstash it falls
// back to a per-process ring buffer, which is correct on a single
// always-on server and is the local dev default.
import { kv, kvConfigured, kvPipeline } from "@/lib/kv";

export interface OpsEvent {
  id: number;
  ts: number;
  agent: string;
  action: string;
  detail: string;
}

const MAX_EVENTS = 100;
const SEQ_KEY = "aetheria:ops:seq";
const LIST_KEY = "aetheria:ops:events";

const g = globalThis as unknown as {
  __aetheriaOps?: { seq: number; events: OpsEvent[] };
};
g.__aetheriaOps ??= { seq: 0, events: [] };
const memory = g.__aetheriaOps;

function clean(agent: string, action: string, detail: string) {
  return {
    agent: String(agent).slice(0, 24).trim(),
    action: String(action).slice(0, 40).trim(),
    detail: String(detail).slice(0, 200).trim(),
  };
}

export async function recordOps(
  agent: string,
  action: string,
  detail = ""
): Promise<number> {
  const e = clean(agent, action, detail);
  if (!e.agent || !e.action) return currentSeqSync();

  if (kvConfigured()) {
    try {
      // INCR gives a monotonic id shared across instances; LTRIM keeps the
      // feed bounded without a separate cleanup path.
      const id = Number(await kv(["INCR", SEQ_KEY]));
      const event: OpsEvent = { id, ts: Date.now(), ...e };
      await kvPipeline([
        ["RPUSH", LIST_KEY, JSON.stringify(event)],
        ["LTRIM", LIST_KEY, -MAX_EVENTS, -1],
      ]);
      return id;
    } catch {
      // Fall through to memory: observability must never break a request.
    }
  }

  const event: OpsEvent = { id: ++memory.seq, ts: Date.now(), ...e };
  memory.events.push(event);
  if (memory.events.length > MAX_EVENTS) {
    memory.events.splice(0, memory.events.length - MAX_EVENTS);
  }
  return event.id;
}

export async function readOps(since = 0): Promise<OpsEvent[]> {
  if (kvConfigured()) {
    try {
      const raw = (await kv(["LRANGE", LIST_KEY, 0, -1])) as unknown[];
      const events = (Array.isArray(raw) ? raw : [])
        .map((r) => {
          try {
            return JSON.parse(String(r)) as OpsEvent;
          } catch {
            return null;
          }
        })
        .filter((e): e is OpsEvent => !!e && Number.isFinite(e.id));
      return Number.isFinite(since) && since > 0
        ? events.filter((e) => e.id > since)
        : events;
    } catch {
      // Fall through to memory.
    }
  }

  return Number.isFinite(since) && since > 0
    ? memory.events.filter((e) => e.id > since)
    : [...memory.events];
}

function currentSeqSync(): number {
  return memory.seq;
}

export async function currentSeq(): Promise<number> {
  if (kvConfigured()) {
    try {
      const v = await kv(["GET", SEQ_KEY]);
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    } catch {
      // Fall through to memory.
    }
  }
  return memory.seq;
}
