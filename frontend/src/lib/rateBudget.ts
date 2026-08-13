// Minimal in-process rate budget for routes that bill per call (LLM
// inference). Per-IP hourly buckets plus an optional global daily cap,
// kept on globalThis so dev hot-reload doesn't reset them. Per-instance on
// multi-instance serverless - a coarse cost brake, not a security boundary.

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as {
  __aetheriaRate?: Map<string, Bucket>;
};
g.__aetheriaRate ??= new Map();
const buckets = g.__aetheriaRate;

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MAX_BUCKETS = 5_000;

function take(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    // Opportunistic sweep so the map can't grow without bound under
    // spoofed/rotating IPs.
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
      if (buckets.size > MAX_BUCKETS) buckets.clear();
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

// True = allowed. Charges one unit against the caller's hourly bucket and
// the route's daily global bucket.
export function takeRate(
  route: string,
  req: Request,
  perIpHour: number,
  globalDay: number
): boolean {
  if (!take(`${route}:day`, globalDay, DAY)) return false;
  return take(`${route}:${clientIp(req)}`, perIpHour, HOUR);
}
