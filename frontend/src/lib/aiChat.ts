// Server-side AI provider abstraction. Two providers:
//
//   anthropic  Claude with schema-guaranteed structured outputs.
//   0g         0G Compute (decentralized inference) via its OpenAI-compatible
//              chat/completions endpoint - JSON enforced by prompt + parsing,
//              since open models don't guarantee schemas.
//
// Selection: AI_PROVIDER env ("anthropic" | "0g"), else anthropic when
// ANTHROPIC_API_KEY is set, else 0g when ZG_COMPUTE_BASE_URL is set, else
// unconfigured (callers fall back to their offline modes).
import Anthropic from "@anthropic-ai/sdk";

export type AiResult =
  | { ok: true; json: any; engine: string }
  | { ok: false; reason: "unconfigured" | "refusal" | "error" };

interface AiChatArgs {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

function pickProvider(): "anthropic" | "0g" | null {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  }
  if (forced === "0g") {
    return process.env.ZG_COMPUTE_BASE_URL ? "0g" : null;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.ZG_COMPUTE_BASE_URL) return "0g";
  return null;
}

export function aiConfigured(): boolean {
  return pickProvider() !== null;
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

// Both providers bill per call - never hold a serverless function open on a
// hung upstream.
const PROVIDER_TIMEOUT_MS = 60_000;

async function anthropicChat(args: AiChatArgs): Promise<AiResult> {
  const client = new Anthropic({ timeout: PROVIDER_TIMEOUT_MS });
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: args.maxTokens ?? 4096,
    output_config: args.schema
      ? {
          effort: "low",
          format: { type: "json_schema", schema: args.schema },
        }
      : { effort: "low" },
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });

  if (response.stop_reason === "refusal") {
    return { ok: false, reason: "refusal" };
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { ok: false, reason: "error" };
  return { ok: true, json: JSON.parse(text), engine: "claude-opus-5" };
}

async function zeroGChat(args: AiChatArgs): Promise<AiResult> {
  const base = process.env.ZG_COMPUTE_BASE_URL!.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;
  const model = process.env.ZG_COMPUTE_MODEL ?? "llama-3.3-70b-instruct";

  // Open models don't guarantee schemas - enforce JSON by instruction and
  // validate on parse.
  const system = args.schema
    ? `${args.system}\n\nRespond with ONLY a valid JSON object conforming to this JSON Schema - no markdown, no commentary:\n${JSON.stringify(args.schema)}`
    : args.system;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.ZG_COMPUTE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ZG_COMPUTE_API_KEY}`;
  }

  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers,
    body: JSON.stringify({
      model,
      max_tokens: args.maxTokens ?? 2048,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: args.user },
      ],
    }),
  });
  if (!res.ok) {
    console.error(`0G Compute error ${res.status}: ${await res.text()}`);
    return { ok: false, reason: "error" };
  }

  const body = await res.json();
  const text: string | undefined = body?.choices?.[0]?.message?.content;
  if (!text) return { ok: false, reason: "error" };
  return { ok: true, json: JSON.parse(stripFences(text)), engine: `0g:${model}` };
}

export async function aiChatJson(args: AiChatArgs): Promise<AiResult> {
  const provider = pickProvider();
  if (!provider) return { ok: false, reason: "unconfigured" };
  try {
    return provider === "anthropic"
      ? await anthropicChat(args)
      : await zeroGChat(args);
  } catch (err) {
    console.error(`AI provider (${provider}) failed:`, err);
    return { ok: false, reason: "error" };
  }
}
