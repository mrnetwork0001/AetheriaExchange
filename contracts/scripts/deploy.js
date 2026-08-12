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
  const [deployer] = await hre.ethers.getSigners();
  const chainId = hre.network.config.chainId;

  console.log(`Deploying OutcomeMarket to ${hre.network.name} (chain ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const factory = await hre.ethers.getContractFactory("OutcomeMarket");
  const contract = await factory.deploy(deployer.address);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`OutcomeMarket deployed at: ${address}`);

  // Merge the deployment into the frontend config so the dApp picks it up.
  const artifact = await hre.artifacts.readArtifact("OutcomeMarket");
  let config = { abi: [], chains: {} };
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  }
  config.abi = artifact.abi;
  config.chains = config.chains || {};
  config.chains[String(chainId)] = {
    address,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Frontend config updated: ${CONFIG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
