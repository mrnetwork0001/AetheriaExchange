"use client";

import { useMemo } from "react";
import { parseEther } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { contractAddress, outcomeMarketAbi, type Market } from "@/lib/contract";
import { existingStakePayout } from "@/lib/payout";

const abi = outcomeMarketAbi as any;

export type PositionState = "OPEN" | "WON" | "LOST" | "REFUND" | "CLAIMED";

export interface Position {
  market: Market;
  yesStake: bigint;
  noStake: bigint;
  state: PositionState;
  // Current value: live payout estimate while OPEN, claimable amount when
  // WON/REFUND, 0 when LOST/CLAIMED.
  value: bigint;
}

function positionState(m: Market, yes: bigint, no: bigint, claimed: boolean): PositionState {
  if (m.status === 0) return "OPEN";
  if (claimed) return "CLAIMED";
  if (m.status === 2) return "REFUND";
  const winStake = m.outcome ? yes : no;
  return winStake > 0n ? "WON" : "LOST";
}

function positionValue(m: Market, yes: bigint, no: bigint, state: PositionState): bigint {
  const winPool = m.outcome ? m.yesPool : m.noPool;
  const losePool = m.outcome ? m.noPool : m.yesPool;
  switch (state) {
    case "REFUND":
      return yes + no;
    case "WON":
      return existingStakePayout(m.outcome ? yes : no, winPool, losePool);
    case "OPEN": {
      // Show what the larger side would pay if it won, at current pools.
      const side = yes >= no;
      const stake = side ? yes : no;
      return existingStakePayout(
        stake,
        side ? m.yesPool : m.noPool,
        side ? m.noPool : m.yesPool
      );
    }
    default:
      return 0n;
  }
}

// Clearly-labeled sample positions for the offline preview, tied to the
// demo markets so the panel demonstrates the full lifecycle pre-deploy.
function demoPositions(markets: Market[]): Position[] {
  const byId = (id: number) => markets.find((m) => m.id === id);
  const out: Position[] = [];
  const btc = byId(0);
  if (btc) {
    const yes = parseEther("2.5");
    out.push({
      market: btc,
      yesStake: yes,
      noStake: 0n,
      state: "OPEN",
      value: existingStakePayout(yes, btc.yesPool, btc.noPool),
    });
  }
  const fed = byId(1);
  if (fed) {
    const no = parseEther("1");
    out.push({
      market: fed,
      yesStake: 0n,
      noStake: no,
      state: "OPEN",
      value: existingStakePayout(no, fed.noPool, fed.yesPool),
    });
  }
  return out;
}

export function usePositions(markets: Market[], live: boolean) {
  const { address } = useAccount();
  const chainId = useChainId();
  const venue = contractAddress(chainId);
  const enabled = live && !!venue && !!address && markets.length > 0;

  const calls = useMemo(() => {
    if (!enabled) return [];
    return markets.flatMap((m) => [
      { abi, address: venue, functionName: "yesStakeOf", args: [BigInt(m.id), address] },
      { abi, address: venue, functionName: "noStakeOf", args: [BigInt(m.id), address] },
      { abi, address: venue, functionName: "claimed", args: [BigInt(m.id), address] },
    ]);
  }, [enabled, markets, venue, address]);

  const { data, refetch } = useReadContracts({
    contracts: calls as any,
    query: { enabled: calls.length > 0, refetchInterval: 15_000 },
  });

  const positions = useMemo<Position[]>(() => {
    if (!live) return demoPositions(markets);
    if (!data) return [];
    const out: Position[] = [];
    markets.forEach((m, i) => {
      const yes = (data[i * 3]?.result as bigint | undefined) ?? 0n;
      const no = (data[i * 3 + 1]?.result as bigint | undefined) ?? 0n;
      const claimed = (data[i * 3 + 2]?.result as boolean | undefined) ?? false;
      if (yes === 0n && no === 0n) return;
      const state = positionState(m, yes, no, claimed);
      out.push({ market: m, yesStake: yes, noStake: no, state, value: positionValue(m, yes, no, state) });
    });
    return out;
  }, [live, markets, data]);

  return { positions, refetch, connected: !!address };
}
