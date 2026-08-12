import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { AppIntent } from "@/lib/intent";

export const runtime = "nodejs";

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intentType", "summary", "outcomeTrade", "dexTrade", "explanation"],
  properties: {
    intentType: {
      type: "string",
      enum: ["OUTCOME_BET", "DEX_HEDGE", "DUAL_STRATEGY", "MARKET_ANALYSIS"],
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
- "explanation" is shown to the user: plain language, one short paragraph, always ending with a one-sentence risk note. Never promise or guarantee returns.
- If the request is ambiguous, prefer MARKET_ANALYSIS and ask for the missing detail in "explanation" rather than inventing a trade.`;

interface IntentRequest {
  prompt?: string;
  userWallet?: string;
  currentMarketContext?: unknown;
}

// Deterministic offline parser so the full flow stays demoable without an API
// key. Clearly labeled via engine: "offline-fallback".
function offlineFallback(prompt: string): AppIntent {
  const lower = prompt.toLowerCase();
  const amountMatch = prompt.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? amountMatch[1] : "10";
  const isNo = /\bno\b|against|won't|wont|fail/.test(lower);
  const wantsTrade = /bet|buy|long|short|hedge|stake|yes|no/.test(lower);

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
// output). Never fabricates a trade — that's reserved for the explicit
// no-API-key demo mode.
function engineUnavailable(): AppIntent {
  return {
    intentType: "MARKET_ANALYSIS",
    summary: "AI engine temporarily unavailable",
    outcomeTrade: null,
    dexTrade: null,
    explanation:
      "The AI engine hit a temporary error — please retry in a moment. No trade was generated.",
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(offlineFallback(prompt));
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: INTENT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            userWallet: body.userWallet ?? null,
            currentMarketContext: body.currentMarketContext ?? [],
          }),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        intentType: "MARKET_ANALYSIS",
        summary: "Request declined",
        outcomeTrade: null,
        dexTrade: null,
        explanation:
          "The co-pilot declined this request. Try rephrasing it as a market question or a simple trade instruction.",
        engine: "claude-opus-5",
      } satisfies AppIntent);
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) {
      return NextResponse.json(engineUnavailable());
    }

    const intent = JSON.parse(text) as AppIntent;
    intent.engine = "claude-opus-5";
    return NextResponse.json(intent);
  } catch (err) {
    console.error("AI intent engine error:", err);
    return NextResponse.json(engineUnavailable());
  }
}
