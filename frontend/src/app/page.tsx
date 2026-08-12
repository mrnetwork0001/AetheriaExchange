"use client";

import { useState } from "react";
import { CopilotPanel } from "@/components/CopilotPanel";
import { ExecutionModal } from "@/components/ExecutionModal";
import { Header } from "@/components/Header";
import { MarketCard } from "@/components/MarketCard";
import { StatFooter } from "@/components/StatFooter";
import { useMarkets } from "@/hooks/useMarkets";
import type { Market } from "@/lib/contract";
import type { AppIntent } from "@/lib/intent";

export default function Home() {
  const { markets, live } = useMarkets();
  const [activeIntent, setActiveIntent] = useState<AppIntent | null>(null);

  function tradeFromCard(market: Market, isYes: boolean) {
    setActiveIntent({
      intentType: "OUTCOME_BET",
      summary: `${isYes ? "YES" : "NO"} on “${market.title}”`,
      outcomeTrade: { marketId: market.id, isYes, amount: "1" },
      dexTrade: null,
      explanation: "",
    });
  }

  return (
    <div className="shell">
      <Header />

      <section className="hero">
        <span className="label">DISTRIBUTION</span>
        <h1>
          A market you can ask.
          <br />
          <span className="dim">A hedge you can click.</span>
        </h1>
      </section>

      <div className="main">
        <div>
          <div className="markets-head">
            <span className="label">OUTCOME MARKETS</span>
            {!live && <span className="preview-tag">OFFLINE PREVIEW</span>}
          </div>
          <div className="markets-grid">
            {markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                onTrade={tradeFromCard}
              />
            ))}
            {markets.length === 0 && (
              <p className="modal-note">NO MARKETS YET — SEED THE VENUE.</p>
            )}
          </div>
        </div>

        <CopilotPanel markets={markets} onExecute={setActiveIntent} />
      </div>

      <StatFooter />

      {activeIntent && (
        <ExecutionModal
          intent={activeIntent}
          markets={markets}
          onClose={() => setActiveIntent(null)}
        />
      )}
    </div>
  );
}
