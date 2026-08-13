import { NextResponse } from "next/server";
import { aiChatJson } from "@/lib/aiChat";
import { takeRate } from "@/lib/rateBudget";

export const runtime = "nodejs";

// Every call bills the inference provider - cap inputs, rate-budget callers,
// and cache per title so N users opening the same market cost one call.
const MAX_TITLE_LEN = 300;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;

interface CachedOdds {
  at: number;
  body: { yesProbability: number; rationale: string; engine: string };
}

const g = globalThis as unknown as { __aetheriaOdds?: Map<string, CachedOdds> };
g.__aetheriaOdds ??= new Map();
const oddsCache = g.__aetheriaOdds;

// Fair-odds estimate for a market question. Consumed by the market-maker
// agent to weight its liquidity seeding; also usable by any client.
const ODDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["yesProbability", "rationale"],
  properties: {
    yesProbability: { type: "number" },
    rationale: { type: "string" },
  },
} as const;

const SYSTEM_PROMPT = `You estimate fair odds for YES/NO prediction-market questions.
Given a market question, return yesProbability - your best estimate of the probability (0.0 to 1.0) that the market resolves YES - and a one-sentence rationale.
Be calibrated: use base rates, stay between 0.05 and 0.95 unless the question is near-certain, and never let the wording's framing bias you.`;

export async function POST(req: Request) {
  let body: { title?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_LEN) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 });
  }
  const category = String(body.category ?? "").slice(0, 24);

  const cacheKey = `${category}|${title}`;
  const hit = oddsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

  if (!takeRate("odds", req, 30, 2000)) {
    return NextResponse.json({
      yesProbability: 0.5,
      rationale: "Rate budget reached - neutral prior.",
      engine: "offline-fallback",
    });
  }

  const result = await aiChatJson({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({ title, category: category || null }),
    schema: ODDS_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1024,
  });

  if (!result.ok) {
    // Neutral prior when no AI provider is configured or the call failed -
    // callers treat 0.5 as "no signal".
    return NextResponse.json({
      yesProbability: 0.5,
      rationale: "AI engine unavailable - neutral prior.",
      engine: "offline-fallback",
    });
  }

  // Strict type-and-range check: open models emit null/""/percent-scale
  // values, and coercing those would masquerade as confident extreme odds
  // that real liquidity gets seeded on. Anything not a genuine 0..1 number
  // is a neutral prior.
  const raw = result.json?.yesProbability;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    return NextResponse.json({
      yesProbability: 0.5,
      rationale: "Malformed estimate - neutral prior.",
      engine: result.engine,
    });
  }

  const out = {
    yesProbability: Math.min(0.95, Math.max(0.05, raw)),
    rationale: String(result.json?.rationale ?? ""),
    engine: result.engine,
  };
  if (oddsCache.size >= CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of oddsCache)
      if (now - v.at >= CACHE_TTL_MS) oddsCache.delete(k);
    if (oddsCache.size >= CACHE_MAX) oddsCache.clear();
  }
  oddsCache.set(cacheKey, { at: Date.now(), body: out });
  return NextResponse.json(out);
}
