// Minimal Upstash Redis client over its REST API.
//
// Why not the SDK: this needs three commands and runs on a serverless host
// where every dependency is cold-start cost. The REST API is a plain fetch,
// works from any runtime, and keeps the dependency surface at zero.
//
// When UPSTASH_REDIS_REST_URL/TOKEN are absent the app keeps working with
// per-process state - correct on a single always-on server, and the local
// dev default. Callers must therefore treat the store as best-effort.

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

export function kvConfigured(): boolean {
  return !!(process.env[URL_ENV] && process.env[TOKEN_ENV]);
}

type Command = (string | number)[];

async function post(path: string, body: unknown): Promise<any> {
  const base = process.env[URL_ENV]!.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env[TOKEN_ENV]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Never let a slow KV hop hold a request open.
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`upstash ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Single command. Returns the raw result, or throws.
export async function kv(command: Command): Promise<any> {
  const json = await post("", command);
  return json?.result;
}

// Several commands in one round trip. Returns results in order.
export async function kvPipeline(commands: Command[]): Promise<any[]> {
  const json = await post("/pipeline", commands);
  return Array.isArray(json) ? json.map((r) => r?.result) : [];
}
