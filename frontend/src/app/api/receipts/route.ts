import { NextResponse } from "next/server";
import { createPublicClient, formatEther, http, type Abi } from "viem";
import { xLayer, xLayerTestnet, explorerTxUrl } from "@/lib/chains";
import { contractAddress, outcomeMarketAbi } from "@/lib/contract";
import { kv, kvConfigured } from "@/lib/kv";
import { readOps } from "@/lib/opsStore";
import config from "@/contracts/config.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The venue's public audit trail: every resolution and cancellation, with
// the settling transaction and (when the ops feed still has it) the
// resolver's own reasoning. Settlement txs come from a chain-log sweep -
// the RPC caps getLogs at 100 blocks, so the sweep runs incrementally and
// the cursor + found events persist in KV. Each request advances the sweep
// a bounded amount; once caught up, requests only scan fresh blocks.

const CHUNK = 100; // RPC-enforced getLogs ceiling
const CONCURRENCY = 16;
const MAX_CHUNKS_PER_REQUEST = 4000;
const TIME_BUDGET_MS = 20_000;

// Single-flight guard: concurrent visitors must not each run their own
// sweep - the stampede rate-limits the RPC for everyone. One sweep at a
// time per process; other requests serve the cached state as-is.
const sweeping = new Set<number>();

interface SettleTx {
  ev: "resolved" | "cancelled";
  tx: string;
  block: number;
  ts: number;
}
interface SweepState {
  cursor: number;
  txs: Record<string, SettleTx>;
}

const g = globalThis as unknown as {
  __aetheriaReceipts?: Record<string, SweepState>;
};
g.__aetheriaReceipts ??= {};
const memoryStates = g.__aetheriaReceipts;

const stateKey = (chainId: number) => `aetheria:receipts:${chainId}`;

async function loadState(chainId: number, deployBlock: number): Promise<SweepState> {
  if (kvConfigured()) {
    try {
      const raw = await kv(["GET", stateKey(chainId)]);
      if (raw) {
        const parsed = JSON.parse(String(raw)) as SweepState;
        if (Number.isFinite(parsed.cursor)) return parsed;
      }
    } catch {
      // KV is best-effort; fall through.
    }
  }
  return memoryStates[String(chainId)] ?? { cursor: deployBlock, txs: {} };
}

async function saveState(chainId: number, state: SweepState) {
  // Merge with whatever is stored rather than blind-writing: a slow request
  // finishing after a faster one (or after an external backfill) must never
  // drag the cursor backwards or drop found txs. Monotonic max + union makes
  // concurrent writers safe.
  let merged = state;
  if (kvConfigured()) {
    try {
      const raw = await kv(["GET", stateKey(chainId)]);
      if (raw) {
        const existing = JSON.parse(String(raw)) as SweepState;
        merged = {
          cursor: Math.max(existing.cursor, state.cursor),
          txs: { ...state.txs, ...existing.txs },
        };
      }
      await kv(["SET", stateKey(chainId), JSON.stringify(merged)]);
    } catch {
      // Best-effort.
    }
  }
  memoryStates[String(chainId)] = merged;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("chainId") ?? "");
  const chain =
    requested === xLayer.id
      ? xLayer
      : requested === xLayerTestnet.id
        ? xLayerTestnet
        : contractAddress(xLayer.id)
          ? xLayer
          : xLayerTestnet;

  const venue = contractAddress(chain.id);
  if (!venue) {
    return NextResponse.json(
      { error: `No venue deployed on chain ${chain.id}` },
      { status: 404 }
    );
  }

  const chains = config.chains as Record<string, { deploymentBlock?: number }>;
  const deployBlock = chains[String(chain.id)]?.deploymentBlock ?? 0;

  const client = createPublicClient({ chain, transport: http() });
  const abi = outcomeMarketAbi as Abi;
  const settleEvents = abi.filter(
    (e) =>
      e.type === "event" &&
      (e.name === "MarketResolved" || e.name === "MarketCancelled")
  );

  try {
    const started = Date.now();
    const latest = Number(await client.getBlockNumber());
    const state = await loadState(chain.id, deployBlock);

    // Venue state first, while the RPC is fresh - the sweep below may get
    // throttled, and a missing tx link degrades far better than a 502.
    const count = Number(
      await client.readContract({
        address: venue,
        abi,
        functionName: "marketCount",
      })
    );
    const reads = await client.multicall({
      contracts: Array.from({ length: count }, (_, id) => ({
        address: venue,
        abi: abi as never,
        functionName: "getMarket",
        args: [BigInt(id)],
      })),
      allowFailure: false,
    });

    // Advance the sweep, bounded by chunk count and wall clock, and only if
    // no other request in this process is already sweeping this chain.
    if (!sweeping.has(chain.id) && state.cursor <= latest) {
      sweeping.add(chain.id);
      try {
        const from = state.cursor;
        const capped = Math.min(
          latest,
          from + CHUNK * MAX_CHUNKS_PER_REQUEST - 1
        );
        const ranges: [number, number][] = [];
        for (let b = from; b <= capped; b += CHUNK) {
          ranges.push([b, Math.min(b + CHUNK - 1, capped)]);
        }

        let swept = from - 1;
        outer: for (let i = 0; i < ranges.length; i += CONCURRENCY) {
          if (Date.now() - started > TIME_BUDGET_MS) break outer;
          const slice = ranges.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            slice.map(async ([f, t]) => {
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  return await client.getLogs({
                    address: venue,
                    events: settleEvents as never,
                    fromBlock: BigInt(f),
                    toBlock: BigInt(t),
                  });
                } catch {
                  await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
                }
              }
              return null; // range failed - stop the cursor here
            })
          );
          for (let j = 0; j < results.length; j++) {
            const logs = results[j];
            if (logs === null) break outer;
            for (const log of logs) {
              const decoded = log as unknown as {
                eventName: string;
                args: { marketId: bigint };
                transactionHash: string;
                blockNumber: bigint;
              };
              const block = await client.getBlock({
                blockNumber: decoded.blockNumber,
              });
              state.txs[String(decoded.args.marketId)] = {
                ev:
                  decoded.eventName === "MarketResolved"
                    ? "resolved"
                    : "cancelled",
                tx: decoded.transactionHash,
                block: Number(decoded.blockNumber),
                ts: Number(block.timestamp),
              };
            }
            swept = slice[j][1];
          }
        }
        if (swept >= from) {
          state.cursor = swept + 1;
          await saveState(chain.id, state);
        }
      } finally {
        sweeping.delete(chain.id);
      }
    }
    const indexing = state.cursor <= latest - CHUNK;

    // Best-effort resolver reasoning from the ops feed (bounded retention -
    // older settlements simply have no log line).
    const ops = await readOps();
    const resolverLog = (id: number) =>
      ops
        .filter(
          (e) =>
            e.agent === "resolver" &&
            !["online", "done"].includes(e.action) &&
            new RegExp(`#${id}\\b`).test(e.detail)
        )
        .map((e) => `${e.action} | ${e.detail}`)
        .pop() ?? null;

    const receipts = [];
    const zeroStakeCancelled = [];
    let openCount = 0;

    for (let id = 0; id < count; id++) {
      const m = reads[id] as unknown as {
        title: string;
        category: string;
        endTime: bigint;
        status: number;
        outcome: boolean;
        yesPool: bigint;
        noPool: bigint;
      };
      const status = Number(m.status);
      if (status === 0) {
        openCount++;
        continue;
      }
      const yes = BigInt(m.yesPool);
      const no = BigInt(m.noPool);
      const total = yes + no;
      const settle = state.txs[String(id)] ?? null;
      const base = {
        id,
        title: m.title,
        category: m.category,
        endTime: Number(m.endTime),
        tx: settle?.tx ?? null,
        txUrl: settle ? explorerTxUrl(chain.id, settle.tx) : null,
        settledAt: settle?.ts ?? null,
      };

      if (status === 2 && total === 0n) {
        zeroStakeCancelled.push(base);
        continue;
      }

      if (status === 1) {
        const winPool = m.outcome ? yes : no;
        const losePool = m.outcome ? no : yes;
        // Mirrors claimPayout: winners split the fee-net losing pool.
        const multiple =
          winPool > 0n
            ? Number(winPool + losePool - (losePool * 200n) / 10_000n) /
              Number(winPool)
            : null;
        receipts.push({
          ...base,
          kind: "resolved" as const,
          outcome: m.outcome,
          yesPoolOkb: formatEther(yes),
          noPoolOkb: formatEther(no),
          winnersMultiple: multiple ? multiple.toFixed(2) : null,
          resolverLog: resolverLog(id),
        });
      } else {
        receipts.push({
          ...base,
          kind: "refunded" as const,
          outcome: null,
          yesPoolOkb: formatEther(yes),
          noPoolOkb: formatEther(no),
          refundedOkb: formatEther(total),
          resolverLog: resolverLog(id),
        });
      }
    }

    receipts.sort(
      (a, b) => (b.settledAt ?? b.endTime) - (a.settledAt ?? a.endTime)
    );

    return NextResponse.json({
      chainId: chain.id,
      venue,
      indexing,
      progress: indexing
        ? Math.round(
            ((state.cursor - deployBlock) / Math.max(1, latest - deployBlock)) *
              100
          )
        : 100,
      counts: {
        resolved: receipts.filter((r) => r.kind === "resolved").length,
        refunded: receipts.filter((r) => r.kind === "refunded").length,
        zeroStakeCancelled: zeroStakeCancelled.length,
        open: openCount,
      },
      receipts,
      zeroStakeCancelled,
    });
  } catch (err) {
    console.error("receipts API error:", err);
    return NextResponse.json(
      { error: "Failed to read settlement history from chain" },
      { status: 502 }
    );
  }
}
