"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityTicker } from "@/components/ActivityTicker";
import { AgentOpsPanel, useAgentOps } from "@/components/AgentOps";
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
import type { AppIntent, MarketDraft } from "@/lib/intent";
import type { CreateMarketInitial } from "@/components/CreateMarketModal";

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Tab = "markets" | "positions" | "agents";

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
  const ops = useAgentOps();
  // Co-pilot visibility, persisted per browser. Defaults open (it's the
  // product's identity); starts open on the server render and applies the
  // stored preference after mount to avoid a hydration mismatch.
  const [copilotOpen, setCopilotOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("aetheria:copilot-open") === "0")
        setCopilotOpen(false);
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggleCopilot(open: boolean) {
    setCopilotOpen(open);
    try {
      localStorage.setItem("aetheria:copilot-open", open ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  const [category, setCategory] = useState("ALL");
  const [activeIntent, setActiveIntent] = useState<AppIntent | null>(null);
  // Store only the id so the modal always renders fresh pools/status from
  // the polled markets list instead of a frozen snapshot.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateMarketInitial | null>(
    null
  );
  const deepLinkHandled = useRef(false);

  const detailMarket = useMemo(
    () => markets.find((m) => m.id === detailId) ?? null,
    [markets, detailId]
  );

  // Deep link: ?tab=agents|positions selects a tab on load.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "agents" || t === "positions") setTab(t);
  }, []);

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
  // A previously-selected category can vanish (markets refetched) - fall
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

  function openDraftTicket(draft: MarketDraft) {
    setCreateDraft({
      title: draft.title,
      category: draft.category,
      endLocal: isoToLocalInput(draft.endTimeIso),
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

      <ActivityTicker items={activity} onSelect={openDetail} />

      <div
        className={`main ${copilotOpen ? "" : "copilot-closed"}`}
        id="markets"
      >
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
              <button
                className={`tab ${tab === "agents" ? "active" : ""}`}
                onClick={() => setTab("agents")}
              >
                AGENT OPS
              </button>
            </div>
            <div className="markets-head-right">
              <span
                className="agents-chip"
                onClick={() => setTab("agents")}
                title="Open the AGENT OPS console"
              >
                <span className="ops-dot on" />
                {ops.onlineCount}/4 AGENTS ONLINE
              </span>
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
                    NO MARKETS IN THIS CATEGORY - DEPLOY ONE.
                  </p>
                )}
              </div>
            </>
          ) : tab === "positions" ? (
            <PositionsPanel
              positions={positions}
              live={live}
              connected={connected}
              onRefetch={() => {
                refetch();
                refetchPositions();
              }}
            />
          ) : (
            <AgentOpsPanel ops={ops} />
          )}
        </div>

        {copilotOpen && (
          <CopilotPanel
            markets={markets}
            onExecute={setActiveIntent}
            onDraft={openDraftTicket}
            onClose={() => toggleCopilot(false)}
          />
        )}
      </div>

      {!copilotOpen && (
        <button
          className="copilot-fab"
          onClick={() => toggleCopilot(true)}
          title="Open the AI co-pilot"
        >
          <span className="copilot-dot" />
          ASK AI
        </button>
      )}

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

      {(createOpen || createDraft) && (
        <CreateMarketModal
          key={createDraft?.title ?? "blank"}
          live={live}
          initial={createDraft ?? undefined}
          onClose={() => {
            setCreateOpen(false);
            setCreateDraft(null);
          }}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
