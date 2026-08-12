// Syncs the compiled OutcomeMarket ABI into the frontend config without
// requiring a deployment — lets the frontend build against the real ABI
// while contract addresses are still empty (demo mode).
const fs = require("fs");
const path = require("path");

const ARTIFACT = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "OutcomeMarket.sol",
  "OutcomeMarket.json"
);
const CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "contracts",
  "config.json"
);

const artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
let config = { abi: [], chains: {} };
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}
config.abi = artifact.abi;
config.chains = config.chains || {};

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
console.log(`ABI exported to ${CONFIG_PATH}`);
