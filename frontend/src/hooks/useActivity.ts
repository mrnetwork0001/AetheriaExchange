"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAbiItem } from "viem";
import { useChainId, usePublicClient, useWatchContractEvent } from "wagmi";
import { contractAddress, outcomeMarketAbi, type Market } from "@/lib/contract";
import { fmtOkb } from "@/lib/payout";

const abi = outcomeMarketAbi as any;

export type ActivityKind = "BET" | "NEW" | "RESOLVED" | "CANCELLED";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  marketId: number | null;
  text: string;
}

const EV_BET = parseAbiItem(
  "event SharesBought(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 amount)"
);
const EV_NEW = parseAbiItem(
  "event MarketCreated(uint256 indexed marketId, string title, string category, uint64 endTime, address indexed creator)"
);
const EV_RES = parseAbiItem(
  "event MarketResolved(uint256 indexed marketId, bool outcome, uint256 fee)"
);
const EV_CANCEL = parseAbiItem("event MarketCancelled(uint256 indexed marketId)");

// X Layer public RPCs cap eth_getLogs ranges at 100 blocks, so backfill is a
// bounded recent window — full history would need an indexer.
const BACKFILL_BLOCKS = 99n;
const MAX_ITEMS = 24;

function shortTitle(markets: Market[], id: number): string {
  const t = markets.find((m) => m.id === id)?.title ?? `MARKET #${id}`;
  return (t.length > 34 ? `${t.slice(0, 34)}…` : t).toUpperCase();
}

const DEMO_ACTIVITY: ActivityItem[] = [
  { id: "d1", kind: "BET", marketId: 0, text: "▲ 2.50 OKB YES · BTC TRADES ABOVE $150K" },
  { id: "d2", kind: "BET", marketId: 2, text: "▼ 1.00 OKB NO · NIGERIA WINS QUALIFIER" },
  { id: "d3", kind: "NEW", marketId: 3, text: "＋ NEW MARKET · OKB SETS A NEW ALL-TIME HIGH" },
  { id: "d4", kind: "BET", marketId: 1, text: "▼ 3.20 OKB NO · FED CUTS RATES IN SEPTEMBER" },
  { id: "d5", kind: "BET", marketId: 0, text: "▲ 0.75 OKB YES · BTC TRADES ABOVE $150K" },
  { id: "d6", kind: "RESOLVED", marketId: null, text: "✓ RESOLVED YES · ETH ETF NET INFLOWS IN JULY" },
  { id: "d7", kind: "BET", marketId: 2, text: "▲ 5.00 OKB YES · NIGERIA WINS QUALIFIER" },
  { id: "d8", kind: "NEW", marketId: 1, text: "＋ NEW MARKET · FED CUTS RATES IN SEPTEMBER" },
];

export function useActivity(
  markets: Market[],
  live: boolean
): { items: ActivityItem[]; partial: boolean } {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const venue = contractAddress(chainId);
  const [items, setItems] = useState<ActivityItem[]>([]);

  // Mappers read markets through a ref so the watcher callbacks stay
  // referentially stable — an unstable onLogs makes wagmi re-subscribe the
  // RPC filter on every render, dropping events mined in the gap.
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  const mapBet = useCallback((log: any): ActivityItem => {
    const { marketId, isYes, amount } = log.args ?? {};
    const id = Number(marketId ?? 0);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      kind: "BET",
      marketId: id,
      text: `${isYes ? "▲" : "▼"} ${fmtOkb(amount ?? 0n)} OKB ${isYes ? "YES" : "NO"} · ${shortTitle(marketsRef.current, id)}`,
    };
  }, []);

  const mapNew = useCallback((log: any): ActivityItem => {
    const id = Number(log.args?.marketId ?? 0);
    const title = String(log.args?.title ?? `MARKET #${id}`);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      kind: "NEW",
      marketId: id,
      text: `＋ NEW MARKET · ${(title.length > 38 ? `${title.slice(0, 38)}…` : title).toUpperCase()}`,
    };
  }, []);

  const mapRes = useCallback((log: any): ActivityItem => {
    const id = Number(log.args?.marketId ?? 0);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      kind: "RESOLVED",
      marketId: id,
      text: `✓ RESOLVED ${log.args?.outcome ? "YES" : "NO"} · ${shortTitle(marketsRef.current, id)}`,
    };
  }, []);

  const mapCancel = useCallback((log: any): ActivityItem => {
    const id = Number(log.args?.marketId ?? 0);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      kind: "CANCELLED",
      marketId: id,
      text: `✕ CANCELLED · ${shortTitle(marketsRef.current, id)} — STAKES REFUNDABLE`,
    };
  }, []);

  const prepend = useCallback((mapped: ActivityItem[]) => {
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.id));
      return [...mapped.filter((i) => !seen.has(i.id)), ...prev].slice(0, MAX_ITEMS);
    });
  }, []);

  const onBet = useCallback((logs: any[]) => prepend(logs.map(mapBet)), [prepend, mapBet]);
  const onNew = useCallback((logs: any[]) => prepend(logs.map(mapNew)), [prepend, mapNew]);
  const onRes = useCallback((logs: any[]) => prepend(logs.map(mapRes)), [prepend, mapRes]);
  const onCancel = useCallback((logs: any[]) => prepend(logs.map(mapCancel)), [prepend, mapCancel]);

  // Bounded backfill of the most recent window (RPC caps the range at 100).
  useEffect(() => {
    if (!live || !venue || !publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n;
        const range = { address: venue, fromBlock, toBlock: latest } as const;
        const [bets, created, resolved, cancels] = await Promise.all([
          publicClient.getLogs({ ...range, event: EV_BET }),
          publicClient.getLogs({ ...range, event: EV_NEW }),
          publicClient.getLogs({ ...range, event: EV_RES }),
          publicClient.getLogs({ ...range, event: EV_CANCEL }),
        ]);
        if (cancelled) return;
        const backfilled = [
          ...bets.map((l) => ({ log: l, item: mapBet(l) })),
          ...created.map((l) => ({ log: l, item: mapNew(l) })),
          ...resolved.map((l) => ({ log: l, item: mapRes(l) })),
          ...cancels.map((l) => ({ log: l, item: mapCancel(l) })),
        ]
          .sort((a, b) => {
            const bn = Number((b.log.blockNumber ?? 0n) - (a.log.blockNumber ?? 0n));
            return bn !== 0 ? bn : Number(b.log.logIndex ?? 0) - Number(a.log.logIndex ?? 0);
          })
          .map((x) => x.item);
        // Watched (newer) items stay on top; backfill fills in behind them.
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...backfilled.filter((i) => !seen.has(i.id))].slice(0, MAX_ITEMS);
        });
      } catch {
        // Backfill is best-effort; the live watchers below still populate.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, venue, publicClient, mapBet, mapNew, mapRes, mapCancel]);

  useWatchContractEvent({
    address: venue ?? undefined,
    abi,
    eventName: "SharesBought",
    enabled: live && !!venue,
    onLogs: onBet,
  });
  useWatchContractEvent({
    address: venue ?? undefined,
    abi,
    eventName: "MarketCreated",
    enabled: live && !!venue,
    onLogs: onNew,
  });
  useWatchContractEvent({
    address: venue ?? undefined,
    abi,
    eventName: "MarketResolved",
    enabled: live && !!venue,
    onLogs: onRes,
  });
  useWatchContractEvent({
    address: venue ?? undefined,
    abi,
    eventName: "MarketCancelled",
    enabled: live && !!venue,
    onLogs: onCancel,
  });

  return live
    ? { items, partial: true }
    : { items: DEMO_ACTIVITY, partial: false };
}
