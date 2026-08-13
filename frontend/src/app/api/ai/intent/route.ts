import { NextResponse } from "next/server";
import { aiChatJson } from "@/lib/aiChat";
import { recordOps } from "@/lib/opsStore";
import { takeRate } from "@/lib/rateBudget";
import { EQUITY_HEDGE, XSTOCK_SYMBOLS } from "@/lib/tokens";
import type { AppIntent } from "@/lib/intent";

// Paid-inference route: every input field is length-capped before it can
// reach the model, and callers are rate-budgeted.
const MAX_PROMPT_LEN = 2000;
const MAX_CONTEXT_MARKETS = 40;

// A tokenized-equity leg is only a hedge when it is the SAME company's share
// AND it moves opposite to the outcome bet - selling the share against a YES
// (which profits when the stock rises), buying it against a NO. The prompt
// states both rules, but a model that mixes up a ticker or a direction would
// hand the user a ticket that doubles their exposure while calling it a
// hedge, so the pairing is enforced here rather than trusted.
function badEquityPairing(
  intent: AppIntent,
  context: { id: number; title: string }[]
): boolean {
  const trade = intent.outcomeTrade;
  const dex = intent.dexTrade;
  if (!trade || !dex) return false;

  const tokenIn = dex.tokenIn.toUpperCase();
  const tokenOut = dex.tokenOut.toUpperCase();
  const legs = [tokenIn, tokenOut].filter((s) => XSTOCK_SYMBOLS.includes(s));
  if (legs.length === 0) return false;
  if (legs.length !== 1) return true; // xStock on both sides is not a hedge

  const market = context.find((m) => m.id === trade.marketId);
  if (!market) return true; // an xStock leg against an unknown market

  // Case-sensitive: uppercase tickers only, so ordinary words never match.
  const tickers = Object.keys(EQUITY_HEDGE).filter((t) =>
    new RegExp(`\\b${t}x?\\b`).test(market.title)
  );
  if (tickers.length !== 1) return true; // ambiguous or non-equity market
  if (legs[0] !== EQUITY_HEDGE[tickers[0]].toUpperCase()) return true;

  // Direction: YES profits when the stock rises, so the share must be SOLD
  // (tokenIn); NO profits when it falls, so the share must be BOUGHT.
  const sellingShare = tokenIn === legs[0];
  return trade.isYes ? !sellingShare : sellingShare;
}

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

// Tradable hedge legs on X Layer. Every symbol here must resolve in
// lib/tokens.ts - the execution ticket looks each one up by symbol.
const DEX_TOKENS = [
  "OKB",
  "WOKB",
  "USDT",
  "USDT0",
  "USDC",
  "USDC.e",
  "wTSLAx",
  "wNVDAx",
  "wSPCXx",
];

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
            tokenIn: { type: "string", enum: DEX_TOKENS },
            tokenOut: { type: "string", enum: DEX_TOKENS },
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
              enum: [
                "CRYPTO",
                "MACRO",
                "SPORTS",
                "WEB3",
                "PULSE",
                "RWA",
                "EQUITY",
                "OTHER",
              ],
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
- outcomeTrade references markets by their numeric id from the provided context only. Amounts are in native OKB. Every market in the context is live and tradable - if exactly one matches what the user described, act on it rather than asking which one.
- dexTrade may only use these X Layer tokens. Amounts are human units of tokenIn:
  · OKB (native gas token), WOKB (wrapped OKB)
  · USDC - Circle-issued NATIVE USDC. This is the default USD leg. USDC.e is the deprecated bridged token: use it only as tokenIn when the user explicitly wants to migrate bridged holdings to native.
  · USDT (bridged) and USDT0 (Tether's omnichain USD₮0, the deeper market on X Layer) - prefer USDT0 when routing a USDT-denominated leg.
  · wTSLAx, wNVDAx, wSPCXx - xStocks tokenized equities (Tesla, NVIDIA, SpaceX). X Layer carries most xStocks volume.
- A HEDGE REDUCES the user's net exposure: the DEX leg must pay off in the OPPOSITE direction to the outcome bet. Never pair a bet with a leg that profits in the same direction and call it a hedge - that doubles the risk instead of offsetting it.
  · A YES bet on "<asset> above <level>" profits when the asset RISES, so its hedge SELLS that asset (asset → USDC).
  · A NO bet on "<asset> above <level>" profits when the asset FALLS, so its hedge BUYS that asset (USDC → asset).
- For an EQUITY market the paired asset is the matching tokenized share and ONLY that company's share: TSLA ↔ wTSLAx, NVDA ↔ wNVDAx. So YES + sell wTSLAx, NO + buy wTSLAx.
- A selling hedge only works if the user already holds that asset. Say so plainly in the explanation when the leg sells something they may not hold - they review the ticket before signing, and can skip the leg.
- When the user explicitly wants MORE exposure rather than less ("double down", "go bigger"), you may pair a same-direction leg, but call it a correlated position and never call it a hedge.
- Amounts are in human units of tokenIn: selling wTSLAx means the amount is a number of SHARES (keep it small, e.g. under 1 share), while buying with USDC means the amount is in dollars.
- Keep suggested sizes conservative: never suggest a hedge larger than 3x the outcome stake, never suggest leverage.
- When the user asks for a hedge without naming its size, CHOOSE a conservative size yourself (about 1-2x the outcome stake in USD terms) and say what you chose. Never ask the user to supply the hedge amount - produce the ticket; they review, edit, and sign it. Ask a clarifying question only when you cannot identify the market or the side.
- If the user asks a question or wants analysis without a trade, use intentType MARKET_ANALYSIS with both trades null and put the analysis in "explanation".
- If the user asks to CREATE a market - from a topic, event, or news headline - use intentType MARKET_DRAFT with both trades null and fill "marketDraft": a precise, objectively resolvable YES/NO question (name the resolution criterion; never a matter of opinion), the closest category, an endTimeIso in the future set shortly before the event resolves (default 7–30 days out when the timing is unclear), and a one-sentence rationale. Do not duplicate an existing market from the provided context - refine or decline instead.
- PULSE is the category for short-dated (usually 24h) markets on X Layer's own public metrics - daily active wallets, OKB 24h trading volume (all venues, per CoinGecko), gas burnt. Pulse questions must name the metric, the threshold, the measurement window, and the public data source; close them at the end of the measurement window. Say "trading volume" with its source, never "DEX volume" - the automated resolver settles against all-venue data.
- RWA is the category for markets on tokenized real-world-asset sector metrics - e.g. total RWA TVL across DeFi per DefiLlama, tokenized-treasury AUM. Like PULSE, an RWA question must name the metric, an "above <threshold>" comparator, the window, and the public data source so it resolves mechanically.
- EQUITY is the category for markets on tokenized US equities (xStocks trade on X Layer). Write the question against the UNDERLYING stock's official daily close and NAME THE EXACT SESSION DATE - e.g. "TSLA closes above $340 on 2026-08-14 (Nasdaq official close)". Use exactly one ticker per question from TSLA, AAPL, NVDA, MSFT, META, GOOGL, AMZN, COIN, SPY; use the plain "closes above <price>" comparator; and set endTimeIso to 22:30 UTC ON THAT SAME SESSION DATE - after the 20:00 UTC close prints, same UTC calendar day, never a weekend or US market holiday. The resolver only settles an equity market when the session it names is the session that has printed, so the date in the title and the close date must agree.
- "explanation" is shown to the user: plain language, one short paragraph, always ending with a one-sentence risk note. Never promise or guarantee returns.
- The context carries "nowIso"/"todayUtc" - the real current time. Date every market from those, never from memory, and make sure endTimeIso is in the future.
- If the request is ambiguous, prefer MARKET_ANALYSIS and ask for the missing detail in "explanation" rather than inventing a trade. (This does not apply to hedge sizing, which you always choose yourself.)
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

  const marketContext = sanitizeMarketContext(body.currentMarketContext);

  const result = await aiChatJson({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      prompt,
      // The model has no clock - without this it dates markets from its
      // training prior, producing close times in the past.
      nowIso: new Date().toISOString(),
      todayUtc: new Date().toISOString().slice(0, 10),
      userWallet: String(body.userWallet ?? "").slice(0, 64) || null,
      history: Array.isArray(body.history)
        ? body.history.slice(-8).map((h) => ({
            role: h?.role === "user" ? "user" : "copilot",
            text: String(h?.text ?? "").slice(0, 500),
          }))
        : [],
      currentMarketContext: marketContext,
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

  // Guards that must hold regardless of what the model produced.
  if (
    intent.outcomeTrade &&
    marketContext.length > 0 &&
    !marketContext.some((m) => m.id === intent.outcomeTrade!.marketId)
  ) {
    // A market id outside the live set would send a bet to an unrelated or
    // non-existent market.
    intent.outcomeTrade = null;
    intent.intentType = "MARKET_ANALYSIS";
    intent.explanation = `${intent.explanation}\n\nNote: the market referenced is not in the live market list, so no outcome bet was prepared.`;
  }

  if (badEquityPairing(intent, marketContext)) {
    intent.dexTrade = null;
    intent.intentType = intent.outcomeTrade ? "OUTCOME_BET" : "MARKET_ANALYSIS";
    intent.explanation = `${intent.explanation}\n\nNote: the suggested tokenized-equity leg would not have offset this position (wrong company, or the same direction as the bet), so it was dropped - only the outcome leg remains.`;
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
// Uppercase view of the tradable set - the model may echo any casing, and
// resolveToken() normalizes on lookup.
const DEX_TOKENS_UPPER = DEX_TOKENS.map((t) => t.toUpperCase());
const AMOUNT_RE = /^\d+(\.\d+)?$/;
// A tokenized share is ~$100-1000 each, so a leg denominated in shares is
// only plausible at small sizes - this catches a model that sized the leg
// in dollars while denominating it in shares (500 "USD" = 500 Tesla shares).
const MAX_XSTOCK_SHARES = 5;

function plausibleAmount(symbol: string, amount: string): boolean {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (XSTOCK_SYMBOLS.includes(symbol.toUpperCase())) {
    return n <= MAX_XSTOCK_SHARES;
  }
  return true;
}

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
      AMOUNT_RE.test(amount) &&
      Number(amount) > 0
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
      DEX_TOKENS_UPPER.includes(tokenIn) &&
      DEX_TOKENS_UPPER.includes(tokenOut) &&
      tokenIn !== tokenOut &&
      AMOUNT_RE.test(amount) &&
      plausibleAmount(tokenIn, amount)
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
