// Aetheria Pulse Drafter agent.
//
// An autonomous AI agent that creates the day's PULSE markets: it asks the
// co-pilot's intent engine (Anthropic or 0G Compute, whichever the frontend
// is configured with) to draft a precisely-worded, machine-resolvable
// question for each topic, then deploys it onchain via the permissionless
// createMarket. Run once per invocation - point a cron/scheduler at it.
//
// Run:  npx hardhat run scripts/pulse-drafter.js --network xlayerTestnet
//
// Env:
//   PRIVATE_KEY        funded wallet that signs createMarket
//   AETHERIA_API_URL   frontend base URL (default http://localhost:3003)
//   DRAFTER_TOPICS     semicolon-separated topics (optional; defaults below)
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { opsReporter } = require("./lib/ops");
const { readingFor, thresholdIsSane, usd } = require("./lib/readings");

const ops = opsReporter("pulse-drafter");

const CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "contracts",
  "config.json"
);

const API_URL = (process.env.AETHERIA_API_URL ?? "http://localhost:3003").replace(/\/+$/, "");

// US market holidays that fall on weekdays (NYSE/Nasdaq). Extend yearly -
// an equity market drafted for a non-trading day can never settle, because
// no session prints for it.
const US_MARKET_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

function isUsTradingDay(date = new Date()) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !US_MARKET_HOLIDAYS.has(date.toISOString().slice(0, 10));
}

const EQUITY_TOPIC_RE = /\bEQUITY\b/;

const DEFAULT_TOPICS = [
  "today's X Layer pulse market on daily active wallets",
  "today's X Layer pulse market on OKB 24h trading volume in USD across all venues, per CoinGecko",
  "today's RWA market on total tokenized real-world-asset (RWA) TVL in USD across DeFi, per DefiLlama - category RWA",
  "today's PULSE market on X Layer total DeFi TVL in USD per DefiLlama",
  "today's PULSE market on X Layer total stablecoin circulating supply in USD per DefiLlama",
  // xStocks trade on X Layer, so an equity outcome bet is hedgeable with the
  // tokenized share on the same chain.
  "today's EQUITY market on whether TSLA closes above a specific price at today's Nasdaq official close - name today's date in the question and close the market at 22:30 UTC today (skip if today is not a US trading day)",
  "today's EQUITY market on whether NVDA closes above a specific price at today's Nasdaq official close - name today's date in the question and close the market at 22:30 UTC today (skip if today is not a US trading day)",
];

// Pulse markets are short-dated by definition.
const MIN_CLOSE_SEC = 2 * 3600;
const MAX_CLOSE_SEC = 48 * 3600;

function log(msg) {
  console.log(`[DRAFTER ${new Date().toISOString()}] ${msg}`);
}

// Pulls the number out of a drafted title so it can be sanity-checked
// against the live reading. Mirrors the magnitudes the resolver parses.
const MAGNITUDES = { k: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, bln: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12 };

function thresholdInTitle(title) {
  const m = String(title).match(
    /\$\s*([\d,]+(?:\.\d+)?)\s*(k|mm|mn|m|bln|bn|b|tn|t|million|billion|trillion)?\b/i
  );
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  const suffix = (m[2] ?? "").toLowerCase();
  return suffix ? n * (MAGNITUDES[suffix] ?? NaN) : n;
}

async function draftFromApi(topic, marketContext) {
  // Give the model the current value so it can size a threshold the market
  // could plausibly land either side of. Best-effort: no reading just means
  // the model drafts as it did before.
  const reading = await readingFor(topic);
  const guidance = reading
    ? ` ${reading.text} Choose a threshold close to this value - within about 10% either side - so the outcome is genuinely uncertain at the time of writing. Never pick a threshold the reading has already cleared by a wide margin.`
    : "";

  const res = await fetch(`${API_URL}/api/ai/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `Create ${topic}.${guidance}`,
      userWallet: null,
      currentMarketContext: marketContext,
    }),
  });
  if (!res.ok) throw new Error(`intent API ${res.status}`);
  const intent = await res.json();
  if (!intent?.marketDraft?.title) {
    log(`no draft for "${topic}" (engine: ${intent?.engine ?? "?"}) - skipping`);
    return null;
  }

  // Guard, not just guidance: the prompt can be ignored, and a market whose
  // outcome is decided before it opens is worse than no market at all.
  const verdict = thresholdIsSane(thresholdInTitle(intent.marketDraft.title), reading);
  if (!verdict.ok) {
    log(`rejected draft "${intent.marketDraft.title}" - ${verdict.why}`);
    ops("rejected draft", `${verdict.why}`.slice(0, 180));
    return null;
  }
  if (reading) {
    log(`  anchored on ${reading.label}: ${usd(reading.value)}`);
  }
  return { draft: intent.marketDraft, engine: intent.engine };
}

async function main() {
  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) throw new Error(`No venue deployed on chain ${chainId}`);

  const [signer] = await hre.ethers.getSigners();
  const venue = await hre.ethers.getContractAt("OutcomeMarket", address, signer);

  // Existing markets: context for the AI (it must not duplicate) and a
  // local dedupe guard.
  const count = Number(await venue.marketCount());
  const existing = [];
  for (let id = 0; id < count; id++) {
    const m = await venue.getMarket(id);
    existing.push({ id, title: m.title, category: m.category, status: Number(m.status) });
  }
  const openTitles = new Set(
    existing.filter((m) => m.status === 0).map((m) => m.title.toLowerCase())
  );

  let topics = (process.env.DRAFTER_TOPICS ?? DEFAULT_TOPICS.join(";"))
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);

  // Equity questions resolve from a US session close, so they are only
  // draftable on a trading day.
  if (!isUsTradingDay()) {
    const before = topics.length;
    topics = topics.filter((t) => !EQUITY_TOPIC_RE.test(t));
    if (topics.length < before) {
      log(
        `not a US trading day - skipping ${before - topics.length} equity topic(s)`
      );
    }
  }

  log(`agent online · venue ${address} · ${topics.length} topic(s) · signer ${signer.address}`);
  ops("online", `drafting pass · ${topics.length} topic(s)`);

  const now = Math.floor(Date.now() / 1000);
  let created = 0;

  for (const topic of topics) {
    try {
      const result = await draftFromApi(topic, existing);
      if (!result) continue;
      const { draft, engine } = result;

      if (openTitles.has(draft.title.toLowerCase())) {
        log(`duplicate of an open market - skipping "${draft.title}"`);
        continue;
      }

      let endEpoch = Math.floor(Date.parse(draft.endTimeIso) / 1000);
      if (!Number.isFinite(endEpoch)) endEpoch = now + 24 * 3600;
      // Never clamp an out-of-window draft into the window: a "by Sep 12"
      // question force-closed in 48h would settle early on the wrong
      // horizon. Skip it instead - the wording and the close time must
      // agree.
      if (endEpoch < now + MIN_CLOSE_SEC || endEpoch > now + MAX_CLOSE_SEC) {
        log(
          `draft close ${draft.endTimeIso} outside the ${MIN_CLOSE_SEC / 3600}-${MAX_CLOSE_SEC / 3600}h window - skipping "${draft.title}"`
        );
        ops("skipped", `close horizon out of bounds · "${draft.title}"`);
        continue;
      }

      const tx = await venue.createMarket(draft.title, endEpoch, draft.category ?? "PULSE");
      await tx.wait();
      created++;
      openTitles.add(draft.title.toLowerCase());
      log(`deployed [${draft.category}] "${draft.title}" · closes ${new Date(endEpoch * 1000).toISOString()} · engine ${engine} (${tx.hash})`);
      ops("deployed", `[${draft.category ?? "PULSE"}] "${draft.title}" · engine ${engine}`);
    } catch (err) {
      log(`topic "${topic}" failed: ${err.shortMessage ?? err.message} - continuing`);
    }
  }

  log(`agent done · ${created}/${topics.length} market(s) deployed`);
  ops("done", `${created}/${topics.length} market(s) deployed this pass`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
