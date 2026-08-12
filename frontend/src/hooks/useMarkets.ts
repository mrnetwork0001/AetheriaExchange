"use client";

import { useMemo } from "react";
import { useChainId, useReadContract, useReadContracts } from "wagmi";
import {
  contractAddress,
  DEMO_MARKETS,
  outcomeMarketAbi,
  type Market,
  type MarketStatus,
} from "@/lib/contract";

const abi = outcomeMarketAbi as any;

interface RawMarket {
  title: string;
  category: string;
  endTime: bigint;
  status: number;
  outcome: boolean;
  yesPool: bigint;
  noPool: bigint;
  creator: string;
}

export function useMarkets(): {
  markets: Market[];
  live: boolean;
  loading: boolean;
  refetch: () => void;
} {
  const chainId = useChainId();
  const address = contractAddress(chainId);

  const {
    data: count,
    isLoading: countLoading,
    refetch: refetchCount,
  } = useReadContract({
    abi,
    address: address ?? undefined,
    functionName: "marketCount",
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const marketCalls = useMemo(() => {
    if (!address || count === undefined) return [];
    return Array.from({ length: Number(count) }, (_, i) => ({
      abi,
      address,
      functionName: "getMarket",
      args: [BigInt(i)],
    }));
  }, [address, count]);

  const { data: results, refetch: refetchMarkets } = useReadContracts({
    contracts: marketCalls as any,
    query: { enabled: marketCalls.length > 0, refetchInterval: 15_000 },
  });

  const markets = useMemo<Market[]>(() => {
    if (!address) return DEMO_MARKETS;
    if (!results) return [];
    return results
      .map((res, i) => {
        if (res.status !== "success") return null;
        const m = res.result as unknown as RawMarket;
        return {
          id: i,
          title: m.title,
          category: m.category,
          endTime: Number(m.endTime),
          status: m.status as MarketStatus,
          outcome: m.outcome,
          yesPool: m.yesPool,
          noPool: m.noPool,
          live: true,
        };
      })
      .filter((m): m is Market => m !== null);
  }, [address, results]);

  const loading =
    !!address && (countLoading || (marketCalls.length > 0 && !results));

  return {
    markets,
    live: !!address,
    loading,
    refetch: () => {
      refetchCount();
      refetchMarkets();
    },
  };
}
