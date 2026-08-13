import { NextResponse } from "next/server";
import { aiChatJson } from "@/lib/aiChat";
import { recordOps } from "@/lib/opsStore";
import { takeRate } from "@/lib/rateBudget";
import type { AppIntent } from "@/lib/intent";

// Paid-inference route: every input field is length-capped before it can
// reach the model, and callers are rate-budgeted.
const MAX_PROMPT_LEN = 2000;
const MAX_CONTEXT_MARKETS = 40;

function sanitizeMarketContext(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_CONTEXT_MARKETS).map((m: any) => ({
    id: Number(m?.id),
    title: String(m?.title ?? "").slice(0, 200),
    category: String(m?.category ?? "").slice(0, 24),
    yesPoolOkb: String(m?.yesPoolOkb ?? "").slice(0, 32),
    noPoolOkb: String(m?.noPoolOkb ?? "").slice(0, 32),
    endTime: Number(m?.endTime) || 0,
    status: m?.status === undefined ? undefined : Number(m?.status),
  }));
}

export const runtime = "nodejs";

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intentType",
    "summary",
    "outcomeTrade",
    "dexTrade",
    "marketDraft",
    "explanation",
  ],
  properties: {
    intentType: {
      type: "string",
      enum: [
        "OUTCOME_BET",
        "DEX_HEDGE",
        "DUAL_STRATEGY",
        "MARKET_ANALYSIS",
        "MARKET_DRAFT",
      ],
    },
    summary: { type: "string" },
    outcomeTrade: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["marketId", "isYes", "amount"],
          properties: {
            marketId: { type: "integer" },
            isYes: { type: "boolean" },
            amount: { type: "string" },
          },
        },
      ],
    },
    dexTrade: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["tokenIn", "tokenOut", "amount", "reasoning"],
          properties: {
            tokenIn: { type: "string", enum: ["OKB", "WOKB", "USDT", "USDC"] },
            tokenOut: { type: "string", enum: ["OKB", "WOKB", "USDT", "USDC"] },
            amount: { type: "string" },
            reasoning: { type: "string" },
          },
        },
      ],
    },
    marketDraft: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "category", "endTimeIso", "rationale"],
          properties: {
            title: { type: "string" },
            category: {
              type: "string",
              enum: ["CRYPTO", "MACRO", "SPORTS", "WEB3", "PULSE", "RWA", "OTHER"],
            },
            endTimeIso: { type: "string", format: "date-time" },
            rationale: { type: "string" },
          },
        },
      ],
    },
    explanation: { type: "string" },
  },
} as const;

const SYSTEM_PROMPT = `You are the AI Trading Co-Pilot for Aetheria Exchange, an outcome-market dApp on X Layer with 1-click OKX DEX execution.

Your job: parse the user's message into a structured trade intent.

Context you receive: the user's prompt, their wallet address, and the list of live outcome markets (id, title, category, YES/NO pool sizes in OKB).

Rules:
- outcomeTrade references markets by their numeric id from the provided context only. Amounts are in native OKB.
- dexTrade may only use tokens OKB, WOKB, USDT, USDC (the X Layer set). Amounts are human units of tokenIn.
- Suggest a DEX hedge only when it genuinely correlates with the user's stated position; explain the correlation in "reasoning".
- Keep suggested sizes conservative: never suggest a hedge larger than 3x the outcome stake, never suggest leverage.
- If the user asks a question or wants analysis without a trade, use intentType MARKET_ANALYSIS with both trades null and put the analysis in "explanation".
- If the user asks to CREATE a market - from a topic, event, or news headline - use intentType MARKET_DRAFT with both trades null and fill "marketDraft": a precise, objectively resolvable YES/NO question (name the resolution criterion; never a matter of opinion), the closest category, an endTimeIso in the future set shortly before the event resolves (default 7–30 days out when the timing is unclear), and a one-sentence rationale. Do not duplicate an existing market from the provided context - refine or decline instead.
- PULSE is the category for short-dated (usually 24h) markets on X Layer's own public metrics - daily active wallets, OKB 24h trading volume (all venues, per CoinGecko), gas burnt. Pulse questions must name the metric, the threshold, the measurement window, and the public data source; close them at the end of the measurement window. Say "trading volume" with its source, never "DEX volume" - the automated resolver settles against all-venue data.
- RWA is the category for markets on tokenized real-world-asset sector metrics - e.g. total RWA TVL across DeFi per DefiLlama, tokenized-treasury AUM. Like PULSE, an RWA question must name the metric, an "above <threshold>" comparator, the window, and the public data source so it resolves mechanically.
- "explanation" is shown to the user: plain language, one short paragraph, always ending with a one-sentence risk note. Never promise or guarantee returns.
- If the request is ambiguous, prefer MARKET_ANALYSIS and ask for the missing detail in "explanation" rather than inventing a trade.
- You may receive recent conversation history (the user's persistent memory). Use it to resolve references like "hedge that position" or "same again but NO" - but the current prompt always wins over history.`;

interface IntentRequest {
  prompt?: string;
  userWallet?: string;
  history?: { role: string; text: string }[];
  currentMarketContext?: unknown;
}

// Deterministic offline parser so the full flow stays demoable without an API
// key. Clearly labeled via engine: "offline-fallback".
function offlineFallback(prompt: string): AppIntent {
  const lower = prompt.toLowerCase();
  const amountMatch = prompt.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? amountMatch[1] : "10";
  const isNo = /\bno\b|\bagainst\b|won't|wont|\bfail\b/.test(lower);
  const wantsDraft =
    /\b(create|make|draft|launch|deploy|spin up)\b/.test(lower) &&
    /\bmarket\b/.test(lower);
  const wantsTrade = /\b(bet|buy|long|short|hedge|stake|yes|no)\b/.test(lower);

  if (wantsDraft) {
    const topic = prompt.replace(/.*market\s*(about|on|for|from)?\s*/i, "").trim();
    return {
      intentType: "MARKET_DRAFT",
      summary: "Draft market (offline mode)",
      outcomeTrade: null,
      dexTrade: null,
      marketDraft: {
        title: topic
          ? `${topic.charAt(0).toUpperCase()}${topic.slice(1)} - resolves YES if it happens before close`
          : "New outcome market - edit this question",
        category: "OTHER",
        endTimeIso: new Date(Date.now() + 7 * 86400_000).toISOString(),
        rationale:
          "Offline heuristic draft - review the wording and close time before deploying.",
      },
      explanation:
        "Offline draft (no ANTHROPIC_API_KEY configured): I pre-filled a deploy ticket from your words - tighten the question so it resolves objectively, then deploy. Market creation is permissionless.",
      engine: "offline-fallback",
    };
  }

  if (!wantsTrade) {
    return {
      intentType: "MARKET_ANALYSIS",
      summary: "Market question (offline mode)",
      outcomeTrade: null,
      dexTrade: null,
      explanation:
        "The AI engine is offline (no ANTHROPIC_API_KEY configured), so live analysis is unavailable. Add a key to enable the full co-pilot. Prediction markets and DEX trades carry risk of total loss.",
      engine: "offline-fallback",
    };
  }

  return {
    intentType: "DUAL_STRATEGY",
    summary: `Bet ${amount} OKB ${isNo ? "NO" : "YES"} + correlated USDT→OKB hedge`,
    outcomeTrade: { marketId: 0, isYes: !isNo, amount },
    dexTrade: {
      tokenIn: "USDT",
      tokenOut: "OKB",
      amount: String(Number(amount) * 2),
      reasoning:
        "Offline heuristic: pairs the outcome bet with a modest spot position in the chain's native asset.",
    },
    explanation:
      "Offline fallback strategy (no ANTHROPIC_API_KEY configured): a small outcome bet paired with a 2x-sized spot swap on OKX DEX. Add an API key for real correlated-hedge analysis. Both legs carry risk of total loss.",
    engine: "offline-fallback",
  };
}

// Honest response for runtime engine failures (rate limit, overload, bad
// output). Never fabricates a trade - that's reserved for the explicit
// no-API-key demo mode.
function engineUnavailable(): AppIntent {
  return {
    intentType: "MARKET_ANALYSIS",
    summary: "AI engine temporarily unavailable",
    outcomeTrade: null,
    dexTrade: null,
    explanation:
      "The AI engine hit a temporary error - please retry in a moment. No trade was generated.",
    engine: "claude-opus-5",
  };
}

export async function POST(req: Request) {
  let body: IntentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return NextResponse.json({ error: "Prompt too long" }, { status: 400 });
  }

  if (!takeRate("intent", req, 60, 3000)) {
    return NextResponse.json({
      intentType: "MARKET_ANALYSIS",
      summary: "Rate budget reached",
      outcomeTrade: null,
      dexTrade: null,
      marketDraft: null,
      explanation:
        "The co-pilot's rate budget is exhausted for now - please retry in a while. No trade was generated.",
    } satisfies AppIntent);
  }

  const result = await aiChatJson({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      prompt,
      userWallet: String(body.userWallet ?? "").slice(0, 64) || null,
      history: Array.isArray(body.history)
        ? body.history.slice(-8).map((h) => ({
            role: h?.role === "user" ? "user" : "copilot",
            text: String(h?.text ?? "").slice(0, 500),
          }))
        : [],
      currentMarketContext: sanitizeMarketContext(body.currentMarketContext),
    }),
    schema: INTENT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4096,
  });

  if (!result.ok) {
    if (result.reason === "unconfigured") {
      return NextResponse.json(offlineFallback(prompt));
    }
    if (result.reason === "refusal") {
      return NextResponse.json({
        intentType: "MARKET_ANALYSIS",
        summary: "Request declined",
        outcomeTrade: null,
        dexTrade: null,
        marketDraft: null,
        explanation:
          "The co-pilot declined this request. Try rephrasing it as a market question or a simple trade instruction.",
      } satisfies AppIntent);
    }
    return NextResponse.json(engineUnavailable());
  }

  const intent = sanitizeIntent(result.json, result.engine);
  if (!intent) {
    return NextResponse.json(engineUnavailable());
  }
  // Feed the AGENT OPS console - intent type and engine only, never the
  // user's prompt text.
  recordOps(
    "copilot",
    "intent parsed",
    `${intent.intentType}${intent.engine ? ` · engine ${intent.engine}` : ""}`
  );
  return NextResponse.json(intent);
}

// Schema conformance is only API-guaranteed on the Anthropic path; 0G's open
// models get the schema as a prompt suggestion, so every field is validated
// or coerced here before it can reach the execution flow. Sub-objects that
// fail validation are nulled; a broken core shape returns null.
const DEX_TOKENS = ["OKB", "WOKB", "USDT", "USDC"];
const AMOUNT_RE = /^\d+(\.\d+)?$/;

function sanitizeIntent(raw: any, engine: string): AppIntent | null {
  if (
    !raw ||
    typeof raw.intentType !== "string" ||
    typeof raw.explanation !== "string"
  ) {
    return null;
  }

  let outcomeTrade: AppIntent["outcomeTrade"] = null;
  if (raw.outcomeTrade && typeof raw.outcomeTrade === "object") {
    const marketId = Number(raw.outcomeTrade.marketId);
    const amount = String(raw.outcomeTrade.amount ?? "");
    if (
      Number.isInteger(marketId) &&
      marketId >= 0 &&
      typeof raw.outcomeTrade.isYes === "boolean" &&
      AMOUNT_RE.test(amount)
    ) {
      outcomeTrade = { marketId, isYes: raw.outcomeTrade.isYes, amount };
    }
  }

  let dexTrade: AppIntent["dexTrade"] = null;
  if (raw.dexTrade && typeof raw.dexTrade === "object") {
    const tokenIn = String(raw.dexTrade.tokenIn ?? "").toUpperCase();
    const tokenOut = String(raw.dexTrade.tokenOut ?? "").toUpperCase();
    const amount = String(raw.dexTrade.amount ?? "");
    if (
      DEX_TOKENS.includes(tokenIn) &&
      DEX_TOKENS.includes(tokenOut) &&
      tokenIn !== tokenOut &&
      AMOUNT_RE.test(amount)
    ) {
      dexTrade = {
        tokenIn,
        tokenOut,
        amount,
        reasoning: String(raw.dexTrade.reasoning ?? ""),
      };
    }
  }

  let marketDraft: AppIntent["marketDraft"] = null;
  if (
    raw.marketDraft &&
    typeof raw.marketDraft === "object" &&
    typeof raw.marketDraft.title === "string" &&
    raw.marketDraft.title.trim().length > 0
  ) {
    marketDraft = {
      title: raw.marketDraft.title.trim(),
      category: String(raw.marketDraft.category ?? "OTHER").toUpperCase(),
      endTimeIso: String(raw.marketDraft.endTimeIso ?? ""),
      rationale: String(raw.marketDraft.rationale ?? ""),
    };
  }

  return {
    intentType: raw.intentType as AppIntent["intentType"],
    summary: typeof raw.summary === "string" ? raw.summary : "",
    outcomeTrade,
    dexTrade,
    marketDraft,
    explanation: raw.explanation,
    engine,
  };
}
