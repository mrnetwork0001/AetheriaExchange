// Cancels a market (owner only). Every stake becomes fully refundable via
// claimPayout - use when a question's wording turns out to be ambiguous.
//
// Run:  MARKET_ID=7 npx hardhat run scripts/cancel-market.js --network xlayerTestnet
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
  // Strict: an unset or empty MARKET_ID must never coerce to 0 and cancel
  // market #0, which may be holding real stakes.
  const raw = process.env.MARKET_ID;
  if (!raw || !/^\d+$/.test(raw.trim())) {
    throw new Error("Set MARKET_ID to a market number, e.g. MARKET_ID=7");
  }
  const id = Number(raw.trim());

  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) throw new Error(`No venue deployed on chain ${chainId}`);

  const contract = await hre.ethers.getContractAt("OutcomeMarket", address);
  const count = Number(await contract.marketCount());
  if (id >= count) throw new Error(`Market #${id} does not exist (${count} markets)`);

  const m = await contract.getMarket(id);
  console.log(`Cancelling #${id} [${m.category}] "${m.title}"`);
  const staked = BigInt(m.yesPool) + BigInt(m.noPool);
  console.log(
    `  pools: ${hre.ethers.formatEther(m.yesPool)} YES / ${hre.ethers.formatEther(m.noPool)} NO - all refundable after cancel`
  );
  // Cancelling a market that holds stakes is a real (if refundable) event -
  // require an explicit acknowledgement rather than letting a typo do it.
  if (staked > 0n && process.env.CONFIRM_STAKED !== "1") {
    throw new Error(
      `Market #${id} holds ${hre.ethers.formatEther(staked)} OKB of stakes. Re-run with CONFIRM_STAKED=1 to cancel and refund.`
    );
  }
  const tx = await contract.cancelMarket(id);
  await tx.wait();
  console.log(`Cancelled (${tx.hash})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
