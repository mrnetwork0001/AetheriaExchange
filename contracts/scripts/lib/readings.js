// Current readings for the metrics the drafter writes markets about, so a
// threshold can be chosen near the live value instead of guessed.
//
// Without this the drafter writes markets nobody would take: it once asked
// whether X Layer stablecoin supply exceeds $150M when the real figure was
// $2.07 billion - a market that can only resolve one way, which is worse
// than no market at all.
//
// ─── KEEP IN STEP WITH resolver.js ADAPTERS ────────────────────────────────
// These hit the same endpoints and aggregate them the same way the resolver
// does when it settles. If the two drift, the drafter would size a threshold
// against one number while settlement reads another. Deliberately duplicated
// rather than imported: resolver.js runs main() on require, so importing it
// would fire a settlement pass.

const TIMEOUT_MS = 20_000; // DefiLlama's /protocols payload is ~8.6MB

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const usd = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
};

// Matched against the drafter's topic text, not a market title.
const READINGS = [
  {
    match: /okb[\s\S]*volume/i,
    label: "OKB 24h trading volume across all venues (CoinGecko)",
    read: async () => {
      const j = await getJson(
        "https://api.coingecko.com/api/v3/coins/okb?localization=false&tickers=false&community_data=false&developer_data=false"
      );
      return Number(j?.market_data?.total_volume?.usd);
    },
  },
  {
    match: /\brwa\b[\s\S]*tvl|tvl[\s\S]*\brwa\b/i,
    label: "total tokenized RWA TVL across DeFi (DefiLlama)",
    read: async () => {
      const j = await getJson("https://api.llama.fi/protocols");
      if (!Array.isArray(j)) throw new Error("unexpected protocols response");
      return j
        .filter((p) => p?.category === "RWA")
        .reduce((s, p) => s + (Number(p?.tvl) || 0), 0);
    },
  },
  {
    match: /x\s*layer[\s\S]*stablecoin/i,
    label: "X Layer total stablecoin circulating supply (DefiLlama)",
    read: async () => {
      const j = await getJson("https://stablecoins.llama.fi/stablecoinchains");
      const row = Array.isArray(j) ? j.find((c) => c?.name === "X Layer") : null;
      return Number(row?.totalCirculatingUSD?.peggedUSD);
    },
  },
  {
    match: /x\s*layer[\s\S]*(defi\s*)?tvl/i,
    label: "X Layer total DeFi TVL (DefiLlama)",
    read: async () => {
      const j = await getJson("https://api.llama.fi/v2/chains");
      const row = Array.isArray(j)
        ? j.find((c) => c?.gecko_id === "x-layer" || c?.name === "X Layer")
        : null;
      return Number(row?.tvl);
    },
  },
  {
    // Equity topics name their ticker, so the live quote anchors the strike
    // the same way. The resolver settles on the official CLOSE; this is the
    // current quote, which is the right basis for choosing a strike while
    // the session is still ahead.
    match: /\b(TSLA|NVDA|AAPL|MSFT|META|GOOGL|AMZN|COIN|SPY)\b/,
    label: "the current quote",
    read: async function (topic) {
      const t = String(topic).match(
        /\b(TSLA|NVDA|AAPL|MSFT|META|GOOGL|AMZN|COIN|SPY)\b/
      );
      if (!t) return null;
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${t[1]}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      const j = await res.json();
      return Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);
    },
  },
  {
    match: /daily active wallets/i,
    label: "X Layer daily active wallets",
    // No free public endpoint the resolver settles against, so the drafter
    // gets no anchor here and the guard below simply lets it through.
    read: async () => null,
  },
];

// { value, label, text } for a topic, or null when nothing matches or the
// source is unreachable. Best-effort by design: a drafting run must never
// fail because a third-party API is slow.
async function readingFor(topic) {
  const hit = READINGS.find((r) => r.match.test(topic));
  if (!hit) return null;
  try {
    const value = await hit.read(topic);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      value,
      label: hit.label,
      text: `The current reading for ${hit.label} is ${usd(value)}.`,
    };
  } catch {
    return null;
  }
}

// A threshold is only worth trading if the outcome is genuinely in doubt.
// Anything far from the current reading resolves the moment it is written,
// so the drafter rejects it rather than deploying a foregone conclusion.
const LOW = 0.75;
const HIGH = 1.25;

function thresholdIsSane(threshold, reading) {
  if (!Number.isFinite(threshold) || threshold <= 0) return { ok: true };
  if (!reading || !Number.isFinite(reading.value)) return { ok: true };
  const ratio = threshold / reading.value;
  if (ratio >= LOW && ratio <= HIGH) return { ok: true, ratio };
  return {
    ok: false,
    ratio,
    why: `threshold ${usd(threshold)} is ${ratio < 1 ? "far below" : "far above"} the current ${usd(reading.value)} (${ratio.toFixed(2)}x) - the outcome is already decided`,
  };
}

module.exports = { readingFor, thresholdIsSane, usd };
