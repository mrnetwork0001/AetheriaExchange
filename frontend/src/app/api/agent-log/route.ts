import { NextResponse } from "next/server";
import { currentSeq, readOps, recordOps } from "@/lib/opsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Ops feed. The autonomous agents (market maker, pulse drafter,
// resolver - running on a VPS) POST their decisions here; the site's
// AGENT OPS console polls GET.
//
// Auth: if AGENT_LOG_SECRET is set, POSTs must carry the matching secret -
// set the same value in the agents' environment. Without it (local dev)
// posting is open.

export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("since") ?? "0");
  // `seq` lets pollers detect a store reset (seq below their cursor) and
  // resync instead of freezing on a stale cursor.
  const [events, seq] = await Promise.all([readOps(since), currentSeq()]);
  return NextResponse.json({ events, seq, now: Date.now() });
}

export async function POST(req: Request) {
  let body: { agent?: string; action?: string; detail?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Fail closed in production: an unset secret must not leave a public feed
  // open to poisoning with fake agent activity.
  if (!process.env.AGENT_LOG_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "AGENT_LOG_SECRET not configured - posting disabled" },
        { status: 503 }
      );
    }
  } else if (body.secret !== process.env.AGENT_LOG_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = String(body.agent ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!agent || !action) {
    return NextResponse.json({ error: "agent and action required" }, { status: 400 });
  }

  const id = await recordOps(agent, action, String(body.detail ?? ""));
  return NextResponse.json({ ok: true, id });
}
