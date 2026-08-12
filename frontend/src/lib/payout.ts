import { formatEther } from "viem";

const FEE_BPS = 200n;
const BPS = 10_000n;

// Parimutuel payout if the chosen side wins, for a NEW stake being added:
// the stake joins the winning pool, then splits the (fee-net) losing pool
// pro-rata. Mirrors OutcomeMarket.claimPayout math.
export function estimateNewStakePayout(
  stake: bigint,
  isYes: boolean,
  yesPool: bigint,
  noPool: bigint
): bigint {
  const winPool = (isYes ? yesPool : noPool) + stake;
  const losePool = isYes ? noPool : yesPool;
  if (winPool === 0n) return stake;
  const netLose = losePool - (losePool * FEE_BPS) / BPS;
  return stake + (stake * netLose) / winPool;
}

// Payout for an EXISTING stake at final pools (stake already inside winPool).
export function existingStakePayout(
  stake: bigint,
  winPool: bigint,
  losePool: bigint
): bigint {
  if (winPool === 0n || stake === 0n) return 0n;
  const netLose = losePool - (losePool * FEE_BPS) / BPS;
  return stake + (stake * netLose) / winPool;
}

export function fmtOkb(wei: bigint, dp = 2): string {
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n < 0.01) return n.toPrecision(2);
  return n.toFixed(dp);
}

export function multiplier(stake: bigint, payout: bigint): string {
  if (stake === 0n) return "-";
  return `${(Number(payout) / Number(stake)).toFixed(2)}x`;
}
