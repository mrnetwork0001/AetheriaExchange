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
// our adapters approximate the cited source (aggregation differences,
// timing), so the dispute zone must never auto-settle. resolveMarket is
// final.
const SETTLE_MARGIN = Number(process.env.RESOLVER_SETTLE_MARGIN ?? "0.01");

// Titles whose comparator isn't a plain "above X" are never auto-settled -
// the settlement logic below hardcodes value > threshold.
const NEGATION = /\b(below|under|not|fails?|at\s+least|at\s+or\s+above|less\s+than|fewer|won't|wont)\b/i;

function log(msg) {
  console.log(`[RESOLVER ${new Date().toISOString()}] ${msg}`);
}

// "above $45M" / "above 50K" / "above 1.2 billion" → number.
// The (?![a-z]) guard stops the magnitude suffix from swallowing the first
// letter of the NEXT word: "above $50 by 23:59" is 50, not 50 billion.
function parseThreshold(title) {
  const m = title.match(
    /above\s+\$?([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|k|m|b)?(?![a-z])/i
  );
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const mult =
    {
      k: 1e3,
      thousand: 1e3,
      m: 1e6,
      million: 1e6,
      b: 1e9,
      billion: 1e9,
    }[m[2]?.toLowerCase()] ?? 1;
  return base * mult;
}

// Metric adapters: match a market title to a public data source. Extend as
// the Pulse Drafter's repertoire grows. Adapters return the current value in
// the same unit the title's threshold uses.
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
    match: /^(?=[\s\S]*\brwa\b)(?=[\s\S]*\btvl\b)(?=[\s\S]*defi\s*llama)/i,
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
];

// Categories the agents author machine-resolvable questions for. Everything
// else always goes to the manual queue.
const AUTO_CATEGORIES = new Set(["PULSE", "RWA"]);

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
      if (now - Number(m.endTime) > MAX_STALENESS_SEC)
        reasons.push("closed too long ago for a live reading");
      if (NEGATION.test(m.title)) reasons.push("non-'above' comparator");

      const matched = ADAPTERS.filter((a) => a.match.test(m.title));
      if (matched.length === 0) reasons.push("no metric adapter");
      if (matched.length > 1) reasons.push("ambiguous metric adapters");

      const threshold = parseThreshold(m.title);
      if (threshold === null) reasons.push("no parseable threshold");

      if (reasons.length > 0) {
        manual.push(`#${id} "${m.title}" (${reasons.join("; ")})`);
        continue;
      }

      const adapter = matched[0];
      const value = await adapter.fetch();
      if (Math.abs(value - threshold) <= threshold * SETTLE_MARGIN) {
        manual.push(
          `#${id} "${m.title}" (reading ${value.toLocaleString("en-US")} within ${(SETTLE_MARGIN * 100).toFixed(1)}% of threshold - too close to auto-settle)`
        );
        continue;
      }
      const outcome = value > threshold;
      log(
        `#${id} "${m.title}" · ${adapter.name} = ${value.toLocaleString("en-US")} vs ${threshold.toLocaleString("en-US")} → ${outcome ? "YES" : "NO"}`
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
