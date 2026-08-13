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

const DEFAULT_TOPICS = [
  "today's X Layer pulse market on daily active wallets",
  "today's X Layer pulse market on OKB 24h trading volume in USD across all venues, per CoinGecko",
  "today's RWA market on total tokenized real-world-asset (RWA) TVL in USD across DeFi, per DefiLlama - category RWA",
];

// Pulse markets are short-dated by definition.
const MIN_CLOSE_SEC = 2 * 3600;
const MAX_CLOSE_SEC = 48 * 3600;

function log(msg) {
  console.log(`[DRAFTER ${new Date().toISOString()}] ${msg}`);
}

async function draftFromApi(topic, marketContext) {
  const res = await fetch(`${API_URL}/api/ai/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `Create ${topic}`,
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

  const topics = (process.env.DRAFTER_TOPICS ?? DEFAULT_TOPICS.join(";"))
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);

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
