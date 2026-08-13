// Seeds a freshly deployed OutcomeMarket with demo markets for judges/testing.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "contracts",
  "config.json"
);

const DAY = 24 * 60 * 60;

const DEMO_MARKETS = [
  { title: "BTC trades above $150K before Dec 31, 2026", category: "CRYPTO", days: 30 },
  { title: "Fed cuts rates at the September FOMC meeting", category: "MACRO", days: 14 },
  { title: "Nigeria wins their next World Cup qualifier", category: "SPORTS", days: 7 },
  { title: "OKB sets a new all-time high in 2026", category: "CRYPTO", days: 60 },
  // PULSE: daily markets on X Layer's own metrics (resolved from public data)
  { title: "X Layer daily active wallets close above 50K today", category: "PULSE", days: 1 },
  { title: "OKB 24h trading volume above $45M today per CoinGecko", category: "PULSE", days: 1 },
  // RWA: tokenized real-world-asset sector metrics (resolved from DefiLlama)
  { title: "RWA protocols total TVL above $27.5 billion on DefiLlama today", category: "RWA", days: 1 },
  // EQUITY: tokenized-equity markets, hedgeable with xStocks on X Layer.
  // Equity questions name the exact session and close AFTER it prints (the
  // resolver only settles a reading whose session date matches the market's
  // close date), so these are created by create-market.js with an explicit
  // MARKET_END_ISO rather than seeded on a relative day offset.
];

async function main() {
  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) {
    throw new Error(`No deployment found for chain ${chainId} - run deploy first.`);
  }

  const contract = await hre.ethers.getContractAt("OutcomeMarket", address);
  const now = Math.floor(Date.now() / 1000);

  for (const m of DEMO_MARKETS) {
    const tx = await contract.createMarket(m.title, now + m.days * DAY, m.category);
    await tx.wait();
    console.log(`Created: [${m.category}] ${m.title}`);
  }

  console.log(`Seeded ${DEMO_MARKETS.length} markets on chain ${chainId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
