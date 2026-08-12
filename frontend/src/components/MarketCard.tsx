"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import type { Market } from "@/lib/contract";

function countdown(endTime: number, now: number): string {
  const secs = endTime - now;
  if (secs <= 0) return "CLOSED";
  const d = Math.floor(secs / 86400);
  if (d > 0) return `T-${d}D ${Math.floor((secs % 86400) / 3600)}H`;
  const h = Math.floor(secs / 3600);
  return `T-${h}H ${Math.floor((secs % 3600) / 60)}M`;
}

// The clock is client-only: rendering Date.now() during SSR produces a
// server/client text mismatch and a hydration error.
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function MarketCard({
  market,
  index,
  onTrade,
  onOpen,
}: {
  market: Market;
  index: number;
  onTrade: (market: Market, isYes: boolean) => void;
  onOpen: (market: Market) => void;
}) {
  const now = useNow();
  const total = market.yesPool + market.noPool;
  const yesPct =
    total === 0n ? 50 : Number((market.yesPool * 100n) / total);
  const noPct = 100 - yesPct;
  const closed =
    market.status !== 0 || (now !== null && market.endTime <= now);
  const poolOkb = Number(formatEther(total)).toFixed(2);

  return (
    <article
      className="market-card"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="market-meta">
        <span className="label">{market.category}</span>
        <span className="market-countdown" suppressHydrationWarning>
          {market.status === 1
            ? `RESOLVED ${market.outcome ? "YES" : "NO"}`
            : market.status === 2
              ? "CANCELLED"
              : now === null
                ? "T—"
                : countdown(market.endTime, now)}
        </span>
      </div>

      <button className="market-title-btn" onClick={() => onOpen(market)}>
        <h3 className="market-title">{market.title}</h3>
      </button>

      <div>
        <div className="odds-bar">
          <div className="yes" style={{ width: `${yesPct}%` }} />
          <div className="no" style={{ width: `${noPct}%` }} />
        </div>
        <div className="odds-row" style={{ marginTop: 8 }}>
          <span className="yes-pct">YES {yesPct}%</span>
          <span style={{ color: "var(--faint)" }}>{poolOkb} OKB</span>
          <span className="no-pct">NO {noPct}%</span>
        </div>
      </div>

      <div className="market-actions">
        <button
          className="btn-outcome btn-yes"
          disabled={closed}
          onClick={() => onTrade(market, true)}
        >
          BUY YES
        </button>
        <button
          className="btn-outcome btn-no"
          disabled={closed}
          onClick={() => onTrade(market, false)}
        >
          BUY NO
        </button>
      </div>
    </article>
  );
}
