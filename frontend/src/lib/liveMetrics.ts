// Live readings for the metrics our own markets are written against, so the
// fair-odds model prices with the number in hand instead of guessing.
//
// ─── THESE MUST MIRROR contracts/scripts/resolver.js ADAPTERS ───────────────
// The resolver settles against these exact endpoints and aggregations. If the
// two ever diverge, the AI prices one number while the venue settles a
// different one - which is strictly worse than having no reading at all,
// because the model (and the market maker seeding real OKB behind it) would
// be confidently wrong. Any change to an adapter there belongs here too.
//
// Everything is best-effort: a failed or slow source returns null and the
// caller simply falls back to an unanchored estimate.

const TIMEOUT_MS = 6000;
// DefiLlama's /protocols payload is ~8.6MB and routinely takes 8-9 seconds.
// The default timeout silently killed it, which is exactly the failure this
// module exists to prevent - the model would fall back to guessing without
// anyone noticing. Cached for SOURCE_TTL_MS, so the slow call is rare.
const HEAVY_TIMEOUT_MS = 20_000;

// Metric fetches are shared across every market title that maps to the same
// source, and DefiLlama's /protocols payload is large - one fetch per source
// per window keeps a busy book from hammering public APIs.
const SOURCE_TTL_MS = 3 * 60_000;

interface CachedSource {
  at: number;
  value: number | null;
}
const g = globalThis as unknown as {
  __aetheriaMetrics?: Map<string, CachedSource>;
};
g.__aetheriaMetrics ??= new Map();
const sourceCache = g.__aetheriaMetrics;

async function cached(
  key: string,
  fetcher: () => Promise<number>
): Promise<number | null> {
  const hit = sourceCache.get(key);
  if (hit && Date.now() - hit.at < SOURCE_TTL_MS) return hit.value;
  let value: number | null = null;
  try {
    const v = await fetcher();
    value = Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    value = null;
  }
  // Negative results are cached too: a source that is down should not be
  // retried on every market card in the grid.
  sourceCache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = TIMEOUT_MS
) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const usd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

// Mirrors resolver.js EQUITY_TICKERS. Matched case-sensitively so ordinary
// words are never mistaken for symbols; the optional trailing x covers the
// tokenized wrappers (wTSLAx).
const EQUITY_TICKERS = [
  "TSLA",
  "AAPL",
  "NVDA",
  "MSFT",
  "META",
  "GOOGL",
  "AMZN",
  "COIN",
  "SPY",
];

interface Metric {
  name: string;
  match: (title: string) => boolean;
  read: () => Promise<number | null>;
  describe: (v: number) => string;
}

const METRICS: Metric[] = [
  {
    // resolver: "OKB 24h volume (USD, all venues, CoinGecko)". The DEX
    // lookahead matters - "DEX volume" is a different, smaller number.
    name: "okb-volume",
    match: (t) => /^(?![\s\S]*\bdex\b)(?=[\s\S]*\bokb\b)(?=[\s\S]*volume)/i.test(t),
    read: () =>
      cached("okb-volume", async () => {
        const j = await getJson(
          "https://api.coingecko.com/api/v3/coins/okb?localization=false&tickers=false&community_data=false&developer_data=false"
        );
        return Number(j?.market_data?.total_volume?.usd);
      }),
    describe: (v) =>
      `OKB 24h trading volume across all venues is ${usd(v)} right now (CoinGecko).`,
  },
  {
    // resolver: "OKB price (USD, CoinGecko)".
    name: "okb-price",
    match: (t) => /okb[\s\S]*(price|trades?\s+above|closes?\s+above)/i.test(t),
    read: () =>
      cached("okb-price", async () => {
        const j = await getJson(
          "https://api.coingecko.com/api/v3/simple/price?ids=okb&vs_currencies=usd"
        );
        return Number(j?.okb?.usd);
      }),
    describe: (v) => `OKB is trading at $${v.toFixed(2)} right now (CoinGecko).`,
  },
  {
    // resolver: "RWA sector TVL (USD, DefiLlama)" - sector-wide sum, and
    // explicitly NOT chain-scoped questions.
    name: "rwa-tvl",
    match: (t) =>
      /^(?=[\s\S]*\brwa\b)(?=[\s\S]*\btvl\b)(?=[\s\S]*defi\s*llama)(?![\s\S]*\bx\s*layer\b)/i.test(
        t
      ),
    read: () =>
      cached("rwa-tvl", async () => {
        const j = await getJson(
          "https://api.llama.fi/protocols",
          undefined,
          HEAVY_TIMEOUT_MS
        );
        if (!Array.isArray(j)) throw new Error("unexpected protocols response");
        return j
          .filter((p: { category?: string }) => p?.category === "RWA")
          .reduce(
            (sum: number, p: { tvl?: number }) => sum + (Number(p?.tvl) || 0),
            0
          );
      }),
    describe: (v) =>
      `Total TVL across DefiLlama's RWA category is ${usd(v)} right now.`,
  },
  {
    // resolver: "X Layer DeFi TVL (USD, DefiLlama)".
    name: "xlayer-tvl",
    match: (t) =>
      /^(?=[\s\S]*\bx\s*layer\b)(?=[\s\S]*\btotal\s+(?:defi\s+)?tvl\b)(?![\s\S]*\brwa\b)/i.test(
        t
      ),
    read: () =>
      cached("xlayer-tvl", async () => {
        const j = await getJson("https://api.llama.fi/v2/chains");
        const row = Array.isArray(j)
          ? j.find(
              (c: { gecko_id?: string; name?: string }) =>
                c?.gecko_id === "x-layer" || c?.name === "X Layer"
            )
          : null;
        return Number(row?.tvl);
      }),
    describe: (v) => `X Layer's total DeFi TVL is ${usd(v)} right now (DefiLlama).`,
  },
  {
    // resolver: "X Layer stablecoin supply (USD, DefiLlama)".
    name: "xlayer-stablecoins",
    match: (t) =>
      /^(?=[\s\S]*\bx\s*layer\b)(?=[\s\S]*stablecoin)(?=[\s\S]*(supply|circulating))/i.test(
        t
      ),
    read: () =>
      cached("xlayer-stablecoins", async () => {
        const j = await getJson("https://stablecoins.llama.fi/stablecoinchains");
        const row = Array.isArray(j)
          ? j.find((c: { name?: string }) => c?.name === "X Layer")
          : null;
        return Number(row?.totalCirculatingUSD?.peggedUSD);
      }),
    describe: (v) =>
      `Total stablecoin circulating supply on X Layer is ${usd(v)} right now (DefiLlama).`,
  },
  {
    // resolver: "US equity daily close (USD, Yahoo Finance)". The resolver
    // settles on a COMPLETED session close; this is the live quote, which is
    // the right anchor for pricing a market that has not closed yet.
    name: "equity-quote",
    match: (t) =>
      EQUITY_TICKERS.filter((s) => new RegExp(`\\b${s}x?\\b`).test(t)).length ===
      1,
    read: async () => null, // handled by readEquity, which needs the ticker
    describe: () => "",
  },
];

async function readEquity(title: string): Promise<string | null> {
  const hits = EQUITY_TICKERS.filter((t) =>
    new RegExp(`\\b${t}x?\\b`).test(title)
  );
  if (hits.length !== 1) return null;
  const ticker = hits[0];
  const price = await cached(`equity:${ticker}`, async () => {
    const j = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { "User-Agent": "Mozilla/5.0" }
    );
    return Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);
  });
  return price === null
    ? null
    : `${ticker} is trading at $${price.toFixed(2)} right now.`;
}

// One sentence stating the current reading for whatever metric this title is
// written against, or null when no adapter matches or the source is down.
// Adapters are checked in order and the FIRST match wins, exactly as the
// resolver does it, so a title matching two patterns is described by the same
// source that would settle it.
export async function liveReadingFor(title: string): Promise<string | null> {
  for (const m of METRICS) {
    if (!m.match(title)) continue;
    if (m.name === "equity-quote") return readEquity(title);
    const v = await m.read();
    return v === null ? null : m.describe(v);
  }
  return null;
}
