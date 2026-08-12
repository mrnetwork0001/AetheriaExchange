// Aetheria AI market-maker agent.
//
// A small autonomous bot that keeps outcome markets tradeable: it seeds
// two-sided liquidity into empty markets and tops up whichever side is too
// thin for a counterparty to get a fill. Every stake is a REAL parimutuel
// position — when the market resolves, the bot's losing-side stake pays the
// winners (minus its own winning-side share), so depth provision has a real,
// bounded cost. This is inventory risk, not wash activity.
//
// Scope note: the bot trades ONLY on the OutcomeMarket venue. It generates
// zero OKX DEX volume by design — DEX volume must come from user-signed
// hedges, which is what the Launch Grant's anti-wash rules require.
//
// Run:  MM_PRIVATE_KEY=0x... npx hardhat run scripts/market-maker.js --network xlayerTestnet
//
// Env knobs (all optional):
//   MM_PRIVATE_KEY     dedicated bot key (falls back to PRIVATE_KEY)
//   MM_BUDGET_OKB      lifetime spend cap for this process   (default 3)
//   MM_SEED_OKB        per-side seed for empty markets        (default 0.05)
//   MM_MIN_SIDE_OKB    minimum depth per side                 (default 0.1)
//   MM_MAX_STAKE_OKB   cap for any single top-up tx           (default 0.15)
//   MM_INTERVAL_SEC    base loop interval                     (default 60)
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

const { parseEther, formatEther } = hre.ethers;

const BUDGET = parseEther(process.env.MM_BUDGET_OKB ?? "3");
const SEED = parseEther(process.env.MM_SEED_OKB ?? "0.05");
const MIN_SIDE = parseEther(process.env.MM_MIN_SIDE_OKB ?? "0.1");
const MAX_STAKE = parseEther(process.env.MM_MAX_STAKE_OKB ?? "0.15");
const GAS_RESERVE = parseEther("0.02");
const INTERVAL_MS = Number(process.env.MM_INTERVAL_SEC ?? "60") * 1000;
// Don't take positions in markets about to close — the bot can't exit.
const CLOSE_BUFFER_SEC = 15 * 60;

const min = (...xs) => xs.reduce((a, b) => (a < b ? a : b));
const fmt = (wei) => `${Number(formatEther(wei)).toFixed(4)} OKB`;

function log(msg) {
  console.log(`[MM ${new Date().toISOString()}] ${msg}`);
}

let stopping = false;
let wake = null;
process.on("SIGINT", () => {
  if (stopping) process.exit(130); // second Ctrl-C forces exit
  stopping = true;
  log("SIGINT — finishing current pass then exiting (Ctrl-C again to force)");
  wake?.();
});

// Interruptible sleep: SIGINT wakes it immediately.
function sleep(ms) {
  return new Promise((resolve) => {
    wake = resolve;
    setTimeout(resolve, ms);
  });
}

// Broadcast one stake, counting spend the moment the tx is sent — a wait()
// timeout must never under-count the budget. Skips (rather than fails) when
// the wallet can't cover amount + gas reserve.
async function stakeIfAffordable(venue, wallet, state, marketId, isYes, amount) {
  const balance = await hre.ethers.provider.getBalance(wallet.address);
  if (balance < amount + GAS_RESERVE) {
    log(
      `market #${marketId}: skip ${fmt(amount)} — balance ${fmt(balance)} under amount + gas reserve`
    );
    return;
  }
  const tx = await venue.buyShares(marketId, isYes, { value: amount });
  state.spent += amount;
  await tx.wait();
  log(`market #${marketId} ← ${fmt(amount)} ${isYes ? "YES" : "NO"} (${tx.hash})`);
}

async function main() {
  const chainId = String(hre.network.config.chainId);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const address = config.chains?.[chainId]?.address;
  if (!address) throw new Error(`No venue deployed on chain ${chainId}`);

  const key = process.env.MM_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!key) throw new Error("Set MM_PRIVATE_KEY (or PRIVATE_KEY)");
  const wallet = new hre.ethers.Wallet(key, hre.ethers.provider);
  const venue = await hre.ethers.getContractAt("OutcomeMarket", address, wallet);

  const state = { spent: 0n };
  log(`agent online · venue ${address} · chain ${chainId}`);
  log(`bot ${wallet.address} · budget ${fmt(BUDGET)}`);

  while (!stopping) {
    let count = 0;
    try {
      count = Number(await venue.marketCount());
    } catch (err) {
      log(`marketCount read failed: ${err.shortMessage ?? err.message}`);
    }

    const now = Math.floor(Date.now() / 1000);

    // One market's failure must never starve the rest of the book —
    // each market gets its own fault boundary.
    for (let id = 0; id < count && !stopping; id++) {
      if (state.spent >= BUDGET) break;
      try {
        const m = await venue.getMarket(id);
        if (Number(m.status) !== 0) continue;
        if (Number(m.endTime) <= now + CLOSE_BUFFER_SEC) continue;

        const yes = BigInt(m.yesPool);
        const no = BigInt(m.noPool);

        // Empty market → bootstrap both sides equally (only if the whole
        // pair fits in the remaining budget).
        if (yes === 0n && no === 0n) {
          if (BUDGET - state.spent < SEED * 2n) continue;
          await stakeIfAffordable(venue, wallet, state, id, true, SEED);
          await stakeIfAffordable(venue, wallet, state, id, false, SEED);
          continue;
        }

        // Thin side → top up so takers always have a counterparty,
        // clamped to the remaining budget.
        for (const [isYes, pool] of [
          [true, yes],
          [false, no],
        ]) {
          if (pool < MIN_SIDE && state.spent < BUDGET) {
            const topUp = min(MIN_SIDE - pool, MAX_STAKE, BUDGET - state.spent);
            if (topUp > 0n) {
              await stakeIfAffordable(venue, wallet, state, id, isYes, topUp);
            }
          }
        }
      } catch (err) {
        log(
          `market #${id} pass failed: ${err.shortMessage ?? err.message} — continuing`
        );
      }
    }

    if (state.spent >= BUDGET) {
      log(`budget exhausted (${fmt(state.spent)}) — agent going idle`);
      break;
    }
    if (stopping) break;

    // Jitter so the cadence reads as organic on the activity feed.
    await sleep(INTERVAL_MS + Math.floor(Math.random() * INTERVAL_MS * 0.5));
  }

  log(`agent offline · total deployed ${fmt(state.spent)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
