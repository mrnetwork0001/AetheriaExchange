"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityTicker } from "@/components/ActivityTicker";
import { CopilotPanel } from "@/components/CopilotPanel";
import { CreateMarketModal } from "@/components/CreateMarketModal";
import { ExecutionModal } from "@/components/ExecutionModal";
import { Header } from "@/components/Header";
import { LandingSections } from "@/components/LandingSections";
import { MarketCard } from "@/components/MarketCard";
import { MarketDetailModal } from "@/components/MarketDetailModal";
import { PositionsPanel } from "@/components/PositionsPanel";
import { StatFooter } from "@/components/StatFooter";
import { useActivity } from "@/hooks/useActivity";
import { useMarkets } from "@/hooks/useMarkets";
import { usePositions } from "@/hooks/usePositions";
import type { Market } from "@/lib/contract";
import type { AppIntent } from "@/lib/intent";

type Tab = "markets" | "positions";

export default function Home() {
  const { markets, live, loading, refetch } = useMarkets();
  const { items: activity, partial: activityPartial } = useActivity(
    markets,
    live
  );
  const { positions, refetch: refetchPositions, connected } = usePositions(
    markets,
    live
  );

  const [tab, setTab] = useState<Tab>("markets");
  const [category, setCategory] = useState("ALL");
  const [activeIntent, setActiveIntent] = useState<AppIntent | null>(null);
  // Store only the id so the modal always renders fresh pools/status from
  // the polled markets list instead of a frozen snapshot.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const deepLinkHandled = useRef(false);

  const detailMarket = useMemo(
    () => markets.find((m) => m.id === detailId) ?? null,
    [markets, detailId]
  );

  // Deep link: ?market=<id> opens the detail view exactly once.
  useEffect(() => {
    if (deepLinkHandled.current || markets.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("market");
    if (id === null || !/^\d+$/.test(id)) return;
    deepLinkHandled.current = true;
    if (markets.some((m) => m.id === Number(id))) setDetailId(Number(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets.length]);

  const categories = useMemo(
    () => ["ALL", ...Array.from(new Set(markets.map((m) => m.category)))],
    [markets]
  );
  // A previously-selected category can vanish (markets refetched) — fall
  // back to ALL rather than stranding the user on an empty list.
  const effectiveCategory = categories.includes(category) ? category : "ALL";
  const visibleMarkets =
    effectiveCategory === "ALL"
      ? markets
      : markets.filter((m) => m.category === effectiveCategory);

  function tradeFromCard(market: Market, isYes: boolean) {
    setDetailId(null);
    setActiveIntent({
      intentType: "OUTCOME_BET",
      summary: `${isYes ? "YES" : "NO"} on “${market.title}”`,
      outcomeTrade: { marketId: market.id, isYes, amount: "1" },
      dexTrade: null,
      explanation: "",
    });
  }

  function openDetail(marketId: number) {
    if (markets.some((m) => m.id === marketId)) setDetailId(marketId);
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

      <ActivityTicker items={activity} onSelect={openDetail} />

      <div className="main" id="markets">
        <div>
          <div className="markets-head">
            <div className="tab-bar">
              <button
                className={`tab ${tab === "markets" ? "active" : ""}`}
                onClick={() => setTab("markets")}
              >
                MARKETS
              </button>
              <button
                className={`tab ${tab === "positions" ? "active" : ""}`}
                onClick={() => setTab("positions")}
              >
                MY POSITIONS
                {positions.length > 0 ? ` · ${positions.length}` : ""}
              </button>
            </div>
            <div className="markets-head-right">
              {!live && <span className="preview-tag">OFFLINE PREVIEW</span>}
              <button
                className="connect-btn"
                onClick={() => setCreateOpen(true)}
              >
                ＋ DEPLOY MARKET
              </button>
            </div>
          </div>

          {tab === "markets" ? (
            <>
              {categories.length > 2 && (
                <div className="chip-row" style={{ marginBottom: 14 }}>
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={`chip ${effectiveCategory === c ? "active" : ""}`}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <div className="markets-grid">
                {loading
                  ? Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="skeleton-card" />
                    ))
                  : visibleMarkets.map((market, i) => (
                      <MarketCard
                        key={market.id}
                        market={market}
                        index={i}
                        onTrade={tradeFromCard}
                        onOpen={(m) => setDetailId(m.id)}
                      />
                    ))}
                {!loading && visibleMarkets.length === 0 && (
                  <p className="empty-note">
                    NO MARKETS IN THIS CATEGORY — DEPLOY ONE.
                  </p>
                )}
              </div>
            </>
          ) : (
            <PositionsPanel
              positions={positions}
              live={live}
              connected={connected}
              onRefetch={() => {
                refetch();
                refetchPositions();
              }}
            />
          )}
        </div>

        <CopilotPanel markets={markets} onExecute={setActiveIntent} />
      </div>

      <LandingSections />

      <StatFooter />

      {activeIntent && (
        <ExecutionModal
          intent={activeIntent}
          markets={markets}
          onClose={() => {
            setActiveIntent(null);
            refetch();
            refetchPositions();
          }}
        />
      )}

      {detailMarket && (
        <MarketDetailModal
          market={detailMarket}
          activity={activity}
          activityPartial={activityPartial}
          live={live}
          onTrade={tradeFromCard}
          onClose={() => setDetailId(null)}
          onChanged={() => {
            refetch();
            refetchPositions();
          }}
        />
      )}

      {createOpen && (
        <CreateMarketModal
          live={live}
          onClose={() => setCreateOpen(false)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
