// Aetheria Resolver agent.
//
// Settles ended PULSE markets from public data: parses the machine-resolvable
// question the Pulse Drafter wrote (metric + threshold), fetches the metric
// from a public source, and calls resolveMarket with the outcome. Markets it
// can't resolve mechanically are listed for manual resolution - it never
// guesses. Run once per invocation - point a cron/scheduler at it.
//
// Run:  npx hardhat run scripts/resolver.js --network xlayerTestnet
//
// Env:
//   PRIVATE_KEY                 MUST be the venue owner (resolveMarket is onlyOwner)
//   RESOLVER_DRY_RUN            "1" = log decisions without sending transactions
//   RESOLVER_ALLOWED_CREATORS   comma-separated creator addresses whose markets
//                               may be auto-settled (default: the signer).
//                               createMarket is permissionless, so anyone can
//                               craft a title that pattern-matches an adapter -
//                               only system-authored markets are trusted.
//   RESOLVER_MAX_STALENESS_SEC  skip markets that closed longer ago than this
//                               (default 7200) - the adapters read the metric
//                               NOW, which only approximates the value at close
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { opsReporter } = require("./lib/ops");

const ops = opsReporter("resolver");

const CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "contracts",
  "config.json"
);

const DRY_RUN = process.env.RESOLVER_DRY_RUN === "1";
const MAX_STALENESS_SEC = Number(process.env.RESOLVER_MAX_STALENESS_SEC ?? 2 * 3600);
// Readings within this fraction of the threshold go to the manual queue:
// aggregated metrics (TVL sums, cross-venue volume) differ between sources
// and snapshots, so the dispute zone must never auto-settle - resolveMarket
// is final. Adapters reading an EXACT published figure (an official
// exchange close) override this with their own `margin`, since there is no
// aggregation ambiguity to protect against.
const SETTLE_MARGIN = Number(process.env.RESOLVER_SETTLE_MARGIN ?? "0.01");
const MARGIN_FLOOR = process.env.RESOLVER_SETTLE_MARGIN ? SETTLE_MARGIN : 0;

// Titles whose comparator isn't a plain "above X" are never auto-settled -
// the settlement logic below hardcodes value > threshold.
const NEGATION = /\b(below|under|not|fails?|at\s+least|at\s+or\s+above|less\s+than|fewer|won't|wont)\b/i;

function log(msg) {
  console.log(`[RESOLVER ${new Date().toISOString()}] ${msg}`);
}

// Short everyday words that begin like magnitude notation.
const THRESHOLD_STOPWORDS = new Set([
  "by",
  "be",
  "but",
  "the",
  "to",
  "than",
  "max",
  "min",
  "mid",
  "may",
  "met",
  "buy",
  "bid",
  "tbd",
]);

const MAGNITUDES = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  bln: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
};

// "above $45M" / "above 50K" / "above 1.2 billion" / "above $330 on 2026-08-13"
// → number, or null when the notation is anything this cannot read exactly.
//
// Returning null (→ manual queue) on an unrecognised suffix is the whole
// point: a regex that lets the number group backtrack will happily read
// "$12bn" as 1, and a threshold that wrong settles a market on a value three
// orders of magnitude off - with the dispute band shrinking to match, so
// nothing downstream catches it.
function parseThreshold(title) {
  // "exceeds X" is accepted as a synonym of "above X" (same strict-greater
  // comparator) because LLM-drafted titles use it - the drafting prompt now
  // asks for the literal "above", but deployed titles are immutable.
  const m = title.match(
    /(?:above|exceeds?)\s+\$?\s*([\d,]+(?:\.\d+)?)([a-zA-Z]*)(?:\s+([a-zA-Z]+))?/i
  );
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;

  const attached = (m[2] ?? "").toLowerCase();
  if (attached) {
    // Glued to the digits, so it is meant as a magnitude - read it exactly
    // or refuse.
    return attached in MAGNITUDES ? base * MAGNITUDES[attached] : null;
  }

  const next = (m[3] ?? "").toLowerCase();
  if (next in MAGNITUDES) return base * MAGNITUDES[next];
  // A short token that looks like magnitude notation but is not one we know
  // ("bnn", "trn") must not be silently ignored - unless it is just an
  // ordinary English word that happens to start with the same letter
  // ("above $50 by 23:59").
  if (
    next &&
    next.length <= 3 &&
    /^[kmbt]/.test(next) &&
    !THRESHOLD_STOPWORDS.has(next)
  ) {
    return null;
  }
  return base;
}

// Tokenized-equity (xStocks) markets resolve against the underlying stock's
// official closing price. Matching is CASE-SENSITIVE: lowercase "coin" is an
// ordinary word, uppercase COIN is a ticker. The optional trailing "x"
// accepts the tokenized symbol (TSLAx) as well as the ticker (TSLA).
const EQUITY_TICKERS = {
  TSLA: "Tesla",
  AAPL: "Apple",
  NVDA: "NVIDIA",
  MSFT: "Microsoft",
  META: "Meta",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  COIN: "Coinbase",
  SPY: "S&P 500 ETF",
};

// Close-based verbs ONLY. "trades above" is a touch condition - it can be
// satisfied intraday and still close below - and this adapter answers with
// the daily close, so such questions must go to a human instead.
const EQUITY_COMPARATOR = /(closes?|closing|finishes?|settles?)\s+above/i;

function equityTickersIn(title) {
  return Object.keys(EQUITY_TICKERS).filter((t) =>
    new RegExp(`\\b${t}x?\\b`).test(title)
  );
}

// Yahoo Finance chart API - keyless, needs a browser User-Agent. Returns the
// last COMPLETED daily close and the exchange-local session date it belongs
// to, so the resolver can refuse to settle before the deciding session.
//
// The trailing daily candle of a session that is still trading carries the
// LIVE price in its close field. Settling on that would resolve a market on
// an intraday quote, so any candle inside the current trading period is
// discarded until that period has ended.
async function equityClose(ticker) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=10d`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];

  const period = r?.meta?.currentTradingPeriod?.regular;
  if (!period || !Number.isFinite(Number(period.start))) {
    // Without the trading-period bounds there is no way to tell a completed
    // close from a live quote - fail closed.
    throw new Error("no trading-period metadata to bound the session");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  // Treat any candle at or after the current period's open as unfinished
  // until that period has ended. Before the opening bell nowSec < start, so
  // the guard must not depend on the session having begun.
  const sessionInProgress = nowSec < Number(period.end);

  let i = closes.length - 1;
  while (i >= 0) {
    const unfinished =
      sessionInProgress && Number(ts[i]) >= Number(period.start);
    if (Number.isFinite(closes[i]) && ts[i] && !unfinished) break;
    i--;
  }
  if (i < 0) throw new Error("no completed session close available");

  const asOf = new Date((ts[i] + (r?.meta?.gmtoffset ?? 0)) * 1000)
    .toISOString()
    .slice(0, 10);
  return { value: closes[i], asOf };
}

// Metric adapters: match a market title to a public data source. Extend as
// the Pulse Drafter's repertoire grows. Adapters return the current value in
// the same unit the title's threshold uses - either a bare number (live
// metric, "the value right now") or { value, asOf } where asOf is the UTC
// date string (YYYY-MM-DD) the reading belongs to. An asOf reading is only
// allowed to settle a market whose close date it actually covers: an equity
// market closing Friday must not settle on Thursday's close.
const ADAPTERS = [
  {
    // CoinGecko total_volume spans ALL venues (CEX-dominated). Titles that
    // say "DEX volume" mean a different, smaller number - the negative
    // lookahead sends them to the manual queue instead of settling them
    // against the wrong metric.
    name: "OKB 24h volume (USD, all venues, CoinGecko)",
    match: /^(?![\s\S]*\bdex\b)(?=[\s\S]*\bokb\b)(?=[\s\S]*volume)/i,
    fetch: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/okb?localization=false&tickers=false&community_data=false&developer_data=false"
      );
      if (!res.ok) throw new Error(`coingecko ${res.status}`);
      const j = await res.json();
      const v = j?.market_data?.total_volume?.usd;
      if (!Number.isFinite(v)) throw new Error("no volume in response");
      return v;
    },
  },
  {
    // No bare "above $" alternative - that pattern also matches
    // dollar-denominated volume questions and would compare a price
    // against a volume threshold.
    name: "OKB price (USD, CoinGecko)",
    match: /okb[\s\S]*(price|trades?\s+above|closes?\s+above)/i,
    fetch: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=okb&vs_currencies=usd"
      );
      if (!res.ok) throw new Error(`coingecko ${res.status}`);
      const j = await res.json();
      const v = j?.okb?.usd;
      if (!Number.isFinite(v)) throw new Error("no price in response");
      return v;
    },
  },
  {
    // RWA category markets: total TVL across protocols DefiLlama classifies
    // as "RWA". Matches ONLY titles that name all three of RWA, TVL, and
    // DefiLlama - narrower metrics (tokenized-treasury AUM, single-protocol
    // TVL) must go to the manual queue, not settle against the sector sum.
    name: "RWA sector TVL (USD, DefiLlama)",
    // Sector-wide only: a chain-scoped RWA question would be settled against
    // the global sum, which is a different (much larger) number.
    match: /^(?=[\s\S]*\brwa\b)(?=[\s\S]*\btvl\b)(?=[\s\S]*defi\s*llama)(?![\s\S]*\bx\s*layer\b)/i,
    fetch: async () => {
      const res = await fetch("https://api.llama.fi/protocols");
      if (!res.ok) throw new Error(`defillama ${res.status}`);
      const j = await res.json();
      if (!Array.isArray(j)) throw new Error("unexpected protocols response");
      const v = j
        .filter((p) => p?.category === "RWA")
        .reduce((sum, p) => sum + (Number(p?.tvl) || 0), 0);
      if (!(v > 0)) throw new Error("no RWA TVL in response");
      return v;
    },
  },
  {
    // Tokenized equities: exactly one known ticker plus an "above"
    // comparator. Two tickers in one title is ambiguous - no match, manual
    // queue.
    name: "US equity daily close (USD, Yahoo Finance)",
    match: (title) =>
      equityTickersIn(title).length === 1 && EQUITY_COMPARATOR.test(title),
    fetch: async (title) => equityClose(equityTickersIn(title)[0]),
    // An official closing price is an exact published number, not an
    // aggregate - only a hair of rounding tolerance is warranted.
    margin: 0.0005,
    // Returns { value, asOf } for one named session: a fixed historical
    // figure, so a late pass reads exactly the same number.
    dated: true,
  },
  {
    name: "X Layer DeFi TVL (USD, DefiLlama)",
    // Requires the phrase "total [DeFi] TVL", so a protocol-scoped question
    // ("iZUMi's TVL on X Layer") never settles against the whole chain.
    match: /^(?=[\s\S]*\bx\s*layer\b)(?=[\s\S]*\btotal\s+(?:defi\s+)?tvl\b)(?![\s\S]*\brwa\b)/i,
    fetch: async () => {
      const res = await fetch("https://api.llama.fi/v2/chains");
      if (!res.ok) throw new Error(`defillama ${res.status}`);
      const j = await res.json();
      const row = Array.isArray(j)
        ? j.find((c) => c?.gecko_id === "x-layer" || c?.name === "X Layer")
        : null;
      const v = Number(row?.tvl);
      if (!(v > 0)) throw new Error("no X Layer TVL in response");
      return v;
    },
  },
  {
    // Total stablecoin circulating supply on X Layer. Deliberately NOT a
    // per-issuer metric: DefiLlama's USDC series on X Layer currently tracks
    // only the deprecated bridged token, so a "USDC supply" question would
    // resolve against a number that does not mean what a reader assumes.
    name: "X Layer stablecoin supply (USD, DefiLlama)",
    match: /^(?=[\s\S]*\bx\s*layer\b)(?=[\s\S]*stablecoin)(?=[\s\S]*(supply|circulating))/i,
    fetch: async () => {
      const res = await fetch("https://stablecoins.llama.fi/stablecoinchains");
      if (!res.ok) throw new Error(`defillama stablecoins ${res.status}`);
      const j = await res.json();
      const row = Array.isArray(j) ? j.find((c) => c?.name === "X Layer") : null;
      const v = Number(row?.totalCirculatingUSD?.peggedUSD);
      if (!(v > 0)) throw new Error("no X Layer stablecoin supply in response");
      return v;
    },
  },
];

// Categories the agents author machine-resolvable questions for. Everything
// else always goes to the manual queue.
const AUTO_CATEGORIES = new Set(["PULSE", "RWA", "EQUITY"]);

async function main() {
  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) throw new Error(`No venue deployed on chain ${chainId}`);

  const [signer] = await hre.ethers.getSigners();
  const venue = await hre.ethers.getContractAt("OutcomeMarket", address, signer);

  const owner = await venue.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`signer ${signer.address} is not the venue owner ${owner}`);
  }

  const allowedCreators = new Set(
    (process.env.RESOLVER_ALLOWED_CREATORS ?? signer.address)
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
  );

  log(`agent online · venue ${address}${DRY_RUN ? " · DRY RUN" : ""}`);
  log(`trusted creators: ${[...allowedCreators].join(", ")}`);
  ops("online", `settlement pass${DRY_RUN ? " · dry run" : ""}`);

  const now = Math.floor(Date.now() / 1000);
  const count = Number(await venue.marketCount());
  let resolved = 0;
  const manual = [];

  for (let id = 0; id < count; id++) {
    try {
      const m = await venue.getMarket(id);
      if (Number(m.status) !== 0 || Number(m.endTime) > now) continue;

      // Auto-settlement is opt-in and conservative: only system-authored
      // PULSE markets with exactly one unambiguous adapter, a plain "above"
      // comparator, and a fresh close ever settle mechanically. Everything
      // else is listed for a human - the resolver never guesses, because
      // resolveMarket is final.
      const reasons = [];
      if (!AUTO_CATEGORIES.has(m.category)) reasons.push("not a PULSE/RWA market");
      if (!allowedCreators.has(m.creator.toLowerCase()))
        reasons.push("creator not allowlisted");
      if (NEGATION.test(m.title)) reasons.push("non-'above' comparator");

      const matched = ADAPTERS.filter((a) =>
        typeof a.match === "function" ? a.match(m.title) : a.match.test(m.title)
      );
      if (matched.length === 0) reasons.push("no metric adapter");
      if (matched.length > 1) reasons.push("ambiguous metric adapters");

      // Staleness protects LIVE metrics only. A live adapter reads the value
      // "right now", which drifts away from the value at close, so a late
      // pass must not settle from it. A dated adapter reads a published
      // figure for one named session - a fixed historical number that cannot
      // drift - and the asOf/title-date guard below already refuses anything
      // but that exact session. Applying staleness there would permanently
      // block settlement of a market that can still be settled correctly,
      // which is what stranded markets #6 and #10.
      const datedReading = matched.length === 1 && matched[0].dated === true;
      if (!datedReading && now - Number(m.endTime) > MAX_STALENESS_SEC)
        reasons.push("closed too long ago for a live reading");

      const threshold = parseThreshold(m.title);
      if (threshold === null) reasons.push("no parseable threshold");

      if (reasons.length > 0) {
        manual.push(`#${id} "${m.title}" (${reasons.join("; ")})`);
        continue;
      }

      const adapter = matched[0];
      const reading = await adapter.fetch(m.title);
      const value = typeof reading === "number" ? reading : reading?.value;
      const asOf = typeof reading === "number" ? null : (reading?.asOf ?? null);
      if (!Number.isFinite(value)) {
        manual.push(`#${id} "${m.title}" (adapter returned no usable value)`);
        continue;
      }

      // A dated reading must be exactly the session the market names.
      //
      // The session date written IN THE TITLE is authoritative when present:
      // asOf is an exchange-local date while endTime is a UTC instant, so a
      // market that closes a few hours after the bell can legitimately carry
      // the NEXT UTC date, and comparing against endTime alone would both
      // reject the right session and nominate the following one. When the
      // title names no date, fall back to the close date. Any mismatch goes
      // to a human - never a guess, because resolveMarket is final.
      if (asOf) {
        const closeDate = new Date(Number(m.endTime) * 1000)
          .toISOString()
          .slice(0, 10);
        const titleDate = m.title.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
        const wanted = titleDate ?? closeDate;
        if (asOf !== wanted) {
          manual.push(
            `#${id} "${m.title}" (reading is for session ${asOf}, market names ${wanted} - ${asOf < wanted ? "that session has not printed yet" : "that session already passed"})`
          );
          continue;
        }
        // The named session must also have completed before trading closed.
        if (titleDate && closeDate < titleDate) {
          manual.push(
            `#${id} "${m.title}" (market closed ${closeDate}, before its own named session ${titleDate})`
          );
          continue;
        }
      }

      // An explicitly-set RESOLVER_SETTLE_MARGIN is a floor for every
      // adapter, so widening it stays a working kill-switch even for
      // adapters that declare a tighter margin of their own.
      const margin = Math.max(adapter.margin ?? SETTLE_MARGIN, MARGIN_FLOOR);
      if (Math.abs(value - threshold) <= threshold * margin) {
        manual.push(
          `#${id} "${m.title}" (reading ${value.toLocaleString("en-US")} within ${(margin * 100).toFixed(2)}% of threshold - too close to auto-settle)`
        );
        continue;
      }
      const outcome = value > threshold;
      log(
        `#${id} "${m.title}" · ${adapter.name} = ${value.toLocaleString("en-US")}${asOf ? ` (as of ${asOf})` : ""} vs ${threshold.toLocaleString("en-US")} → ${outcome ? "YES" : "NO"}`
      );

      if (!DRY_RUN) {
        const tx = await venue.resolveMarket(id, outcome);
        await tx.wait();
        log(`#${id} resolved ${outcome ? "YES" : "NO"} (${tx.hash})`);
      }
      ops(DRY_RUN ? "evaluated" : "settled", `market #${id} → ${outcome ? "YES" : "NO"} · ${adapter.name.split(" (")[0]} ${Math.round(value).toLocaleString("en-US")} vs ${threshold.toLocaleString("en-US")}`);
      resolved++;
    } catch (err) {
      log(`#${id} failed: ${err.shortMessage ?? err.message} - continuing`);
    }
  }

  if (manual.length > 0) {
    log(`needs manual resolution: ${manual.join(" · ")}`);
    ops("manual queue", `${manual.length} ended market(s) flagged for human review - never guessing`);
  }
  log(`agent done · ${resolved} market(s) ${DRY_RUN ? "evaluated" : "resolved"}`);
  ops("done", `${resolved} market(s) ${DRY_RUN ? "evaluated" : "settled"} this pass`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
