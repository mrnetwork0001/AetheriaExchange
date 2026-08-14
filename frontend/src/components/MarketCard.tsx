"use client";

import { formatEther } from "viem";
import type { Market } from "@/lib/contract";
import { useCountdown } from "@/hooks/useNow";

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
  const countdown = useCountdown(market.endTime);
  const total = market.yesPool + market.noPool;
  const yesPct =
    total === 0n ? 50 : Number((market.yesPool * 100n) / total);
  const noPct = 100 - yesPct;
  const closed = market.status !== 0 || countdown?.level === "closed";
  const poolOkb = Number(formatEther(total)).toFixed(2);

  return (
    <article
      className="market-card"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="market-meta">
        <span className="label">{market.category}</span>
        <span
          className={`market-countdown ${market.status === 0 ? (countdown?.level ?? "") : ""}`}
          suppressHydrationWarning
          title={`Trading closes ${new Date(market.endTime * 1000).toLocaleString()}`}
        >
          {market.status === 1
            ? `RESOLVED ${market.outcome ? "YES" : "NO"}`
            : market.status === 2
              ? "CANCELLED"
              : (countdown?.text ?? "CLOSES IN …")}
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
