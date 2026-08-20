// Aetheria AI market-maker agent.
//
// A small autonomous bot that keeps outcome markets tradeable: it seeds
// two-sided liquidity into empty markets and tops up whichever side is too
// thin for a counterparty to get a fill. Bootstrap seeding is AI-informed:
// the bot asks the co-pilot's odds endpoint (/api/ai/odds) for a fair YES
// probability and splits its seed accordingly, so fresh markets open near
// fair odds instead of 50/50. Every stake is a REAL parimutuel position -
// when the market resolves, the bot's losing-side stake pays the winners
// (minus its own winning-side share), so depth provision has a real,
// bounded cost. This is inventory risk, not wash activity.
//
// Scope note: the bot trades ONLY on the OutcomeMarket venue. It generates
// zero OKX DEX volume by design - DEX volume must come from user-signed
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
//   AETHERIA_API_URL   frontend base URL for the odds endpoint
//                      (default http://localhost:3003; neutral 50/50 seeding
//                      when unreachable)
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { opsReporter } = require("./lib/ops");

const ops = opsReporter("market-maker");

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
// Kept well clear of real X Layer gas: post-Jovian a stake costs ~2e-6 OKB
// at 0.02 gwei, so the default still covers thousands of transactions. It is
// env-tunable because a reserve larger than a modestly funded wallet silently
// disables the bot entirely - it can never clear amount + reserve.
const GAS_RESERVE = parseEther(process.env.MM_GAS_RESERVE_OKB ?? "0.005");
const INTERVAL_MS = Number(process.env.MM_INTERVAL_SEC ?? "60") * 1000;
// Don't take positions in markets about to close - the bot can't exit.
const CLOSE_BUFFER_SEC = 15 * 60;

const API_URL = (process.env.AETHERIA_API_URL ?? "http://localhost:3003").replace(/\/+$/, "");

const min = (...xs) => xs.reduce((a, b) => (a < b ? a : b));
const fmt = (wei) => `${Number(formatEther(wei)).toFixed(4)} OKB`;

// Ask the AI for a fair YES probability; null (→ neutral 50/50) when the
// endpoint is unreachable or returns the offline prior.
async function fairYesProb(title) {
  try {
    const res = await fetch(`${API_URL}/api/ai/odds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
      // A hung odds endpoint must never stall the trading loop.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.engine === "offline-fallback") return null;
    const p = Number(j.yesProbability);
    return Number.isFinite(p) ? Math.min(0.8, Math.max(0.2, p)) : null;
  } catch {
    return null;
  }
}

function log(msg) {
  console.log(`[MM ${new Date().toISOString()}] ${msg}`);
}

let stopping = false;
let wake = null;
process.on("SIGINT", () => {
  if (stopping) process.exit(130); // second Ctrl-C forces exit
  stopping = true;
  log("SIGINT - finishing current pass then exiting (Ctrl-C again to force)");
  wake?.();
});

// Interruptible sleep: SIGINT wakes it immediately.
function sleep(ms) {
  return new Promise((resolve) => {
    wake = resolve;
    setTimeout(resolve, ms);
  });
}

// Broadcast one stake, counting spend the moment the tx is sent - a wait()
// timeout must never under-count the budget. Skips (rather than fails) when
// the wallet can't cover amount + gas reserve.
async function stakeIfAffordable(venue, wallet, state, marketId, isYes, amount) {
  const balance = await hre.ethers.provider.getBalance(wallet.address);
  if (balance < amount + GAS_RESERVE) {
    log(
      `market #${marketId}: skip ${fmt(amount)} - balance ${fmt(balance)} under amount + gas reserve`
    );
    return;
  }
  const tx = await venue.buyShares(marketId, isYes, { value: amount });
  state.spent += amount;
  await tx.wait();
  log(`market #${marketId} ← ${fmt(amount)} ${isYes ? "YES" : "NO"} (${tx.hash})`);
  ops(`stake ${isYes ? "YES" : "NO"}`, `market #${marketId} ← ${fmt(amount)} · depth provision`);
}

// Collect the bot's own settled positions. Without this the maker stakes
// forever and never takes anything back: winnings and refunds sit in the
// contract until a human connects the bot's wallet and claims by hand, and
// the working balance only ever falls. Recovered capital also funds the next
// markets, so a modest wallet can keep making markets indefinitely.
//
// claimPayout reverts on a zero payout, so mirror its conditions exactly
// rather than calling speculatively: settled, not already claimed, and a
// stake that is actually owed something (any stake if cancelled; a stake on
// the winning side if resolved).
async function claimSettled(venue, wallet, count) {
  let claimedCount = 0;
  let recovered = 0n;
  for (let id = 0; id < count && !stopping; id++) {
    try {
      const m = await venue.getMarket(id);
      const status = Number(m.status);
      if (status === 0) continue;

      if (await venue.claimed(id, wallet.address)) continue;

      const yesStake = await venue.yesStakeOf(id, wallet.address);
      const noStake = await venue.noStakeOf(id, wallet.address);
      const owed =
        status === 2 // Cancelled - both sides refund in full
          ? yesStake + noStake
          : m.outcome
            ? yesStake
            : noStake;
      if (owed === 0n) continue;

      const before = await hre.ethers.provider.getBalance(wallet.address);
      const tx = await venue.claimPayout(id);
      await tx.wait();
      const after = await hre.ethers.provider.getBalance(wallet.address);
      // Net of gas, so this never overstates what came back.
      const delta = after > before ? after - before : 0n;
      recovered += delta;
      claimedCount++;
      log(
        `market #${id}: claimed ${fmt(delta)} (${status === 2 ? "refund" : "winnings"}) (${tx.hash})`
      );
    } catch (err) {
      log(`market #${id}: claim failed: ${err.shortMessage ?? err.message}`);
    }
  }
  if (claimedCount > 0) {
    ops(
      "claim",
      `${claimedCount} settled market(s) · ${fmt(recovered)} returned to the book`
    );
  }
  return recovered;
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
  ops("online", `chain ${chainId} · budget ${fmt(BUDGET)}`);

  let pass = 0;
  while (!stopping) {
    let count = 0;
    try {
      count = Number(await venue.marketCount());
    } catch (err) {
      log(`marketCount read failed: ${err.shortMessage ?? err.message}`);
    }

    const now = Math.floor(Date.now() / 1000);

    // Sweep settled positions before staking: recovered capital is spendable
    // on this same pass, and the budget counts gross deployment, so claiming
    // first is what lets a small wallet keep working a rotating book.
    if (count > 0) await claimSettled(venue, wallet, count);

    // One market's failure must never starve the rest of the book -
    // each market gets its own fault boundary.
    for (let id = 0; id < count && !stopping; id++) {
      if (state.spent >= BUDGET) break;
      try {
        const m = await venue.getMarket(id);
        if (Number(m.status) !== 0) continue;
        if (Number(m.endTime) <= now + CLOSE_BUFFER_SEC) continue;

        const yes = BigInt(m.yesPool);
        const no = BigInt(m.noPool);

        // Empty market → bootstrap both sides, split by the AI's fair-odds
        // estimate so the market opens near fair implied probability. The
        // total is scaled so the SMALLER side still meets the depth floor -
        // otherwise the next pass's flat top-up would erase the AI ratio and
        // double the per-market spend. minShare >= 20% (p is clamped), so
        // totalSeed is bounded by MIN_SIDE * 5.
        if (yes === 0n && no === 0n) {
          // Affordability first, AI second: the odds call bills the metered
          // inference endpoint, so never ask for odds on a bootstrap the
          // budget or wallet can't fund anyway. Minimum possible bootstrap
          // is the p=0.5 case: max(SEED, MIN_SIDE) per side.
          const minTotal =
            (SEED > MIN_SIDE ? SEED : MIN_SIDE) * 2n;
          if (BUDGET - state.spent < minTotal) continue;
          const balance = await hre.ethers.provider.getBalance(wallet.address);
          if (balance < minTotal + GAS_RESERVE) {
            // Never skip silently: an underfunded wallet otherwise looks like
            // a healthy bot that simply never trades.
            log(
              `market #${id}: cannot bootstrap - balance ${fmt(balance)} under ${fmt(minTotal)} + ${fmt(GAS_RESERVE)} reserve`
            );
            continue;
          }

          const p = (await fairYesProb(m.title)) ?? 0.5;
          const pPct = BigInt(Math.round(p * 100));
          const minSharePct = pPct < 50n ? pPct : 100n - pPct;
          const floorSeed = (MIN_SIDE * 100n + minSharePct - 1n) / minSharePct;
          const totalSeed = floorSeed > SEED * 2n ? floorSeed : SEED * 2n;
          if (BUDGET - state.spent < totalSeed) continue;
          const seedYes = (totalSeed * pPct) / 100n;
          const seedNo = totalSeed - seedYes;
          if (p !== 0.5) {
            log(`market #${id}: AI fair odds ${(p * 100).toFixed(0)}% YES`);
            ops("ai fair odds", `market #${id} → ${(p * 100).toFixed(0)}% YES · seeding at AI ratio`);
          }
          await stakeIfAffordable(venue, wallet, state, id, true, seedYes);
          await stakeIfAffordable(venue, wallet, state, id, false, seedNo);
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
          `market #${id} pass failed: ${err.shortMessage ?? err.message} - continuing`
        );
      }
    }

    if (state.spent >= BUDGET) {
      log(`budget exhausted (${fmt(state.spent)}) - agent going idle`);
      ops("idle", `budget exhausted · ${fmt(state.spent)} deployed`);
      break;
    }
    if (stopping) break;

    // Periodic heartbeat so the site's AGENT OPS console can show the bot
    // as online between (rare) stakes - every 5th pass, not every pass, to
    // keep the feed readable.
    if (++pass % 5 === 0) {
      ops("watch", `book scan · ${count} market(s) · ${fmt(state.spent)} of ${fmt(BUDGET)} deployed`);
    }

    // Jitter so the cadence reads as organic on the activity feed.
    await sleep(INTERVAL_MS + Math.floor(Math.random() * INTERVAL_MS * 0.5));
  }

  log(`agent offline · total deployed ${fmt(state.spent)}`);
  ops("offline", `total deployed ${fmt(state.spent)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
