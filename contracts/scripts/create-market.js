// Creates a single market on the deployed venue. Generic operator tool -
// used for one-off deployments outside the drafter's daily cadence.
//
// Run:  MARKET_TITLE="..." MARKET_CATEGORY=RWA MARKET_HOURS=24 \
//         npx hardhat run scripts/create-market.js --network xlayerTestnet
//
// Env:
//   MARKET_TITLE      required - the YES/NO question
//   MARKET_CATEGORY   default OTHER
//   MARKET_HOURS      hours until close (default 24)
//   MARKET_END_ISO    exact close time as an ISO timestamp; overrides
//                     MARKET_HOURS. Use this for markets whose resolution is
//                     tied to a specific session (e.g. an equity close).
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

async function main() {
  const title = process.env.MARKET_TITLE?.trim();
  if (!title) throw new Error("Set MARKET_TITLE");
  const category = (process.env.MARKET_CATEGORY ?? "OTHER").trim().toUpperCase();
  const hours = Number(process.env.MARKET_HOURS ?? "24");
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("Bad MARKET_HOURS");

  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) throw new Error(`No venue deployed on chain ${chainId}`);

  const contract = await hre.ethers.getContractAt("OutcomeMarket", address);
  let endTime = Math.floor(Date.now() / 1000) + Math.round(hours * 3600);
  if (process.env.MARKET_END_ISO) {
    const exact = Math.floor(Date.parse(process.env.MARKET_END_ISO) / 1000);
    if (!Number.isFinite(exact)) throw new Error("Bad MARKET_END_ISO");
    if (exact <= Math.floor(Date.now() / 1000))
      throw new Error("MARKET_END_ISO is in the past");
    endTime = exact;
  }
  const tx = await contract.createMarket(title, endTime, category);
  await tx.wait();
  const id = Number(await contract.marketCount()) - 1;
  console.log(
    `Created market #${id} [${category}] "${title}" · closes ${new Date(endTime * 1000).toISOString()} (${tx.hash})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
