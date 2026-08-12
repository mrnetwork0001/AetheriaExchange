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
];

async function main() {
  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) {
    throw new Error(`No deployment found for chain ${chainId} — run deploy first.`);
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
