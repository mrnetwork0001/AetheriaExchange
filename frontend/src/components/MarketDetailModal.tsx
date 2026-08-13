"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { contractAddress, outcomeMarketAbi, type Market } from "@/lib/contract";
import { fmtOkb } from "@/lib/payout";
import type { ActivityItem } from "@/hooks/useActivity";

const STATUS_LABEL = ["LIVE", "RESOLVED", "CANCELLED"] as const;

type AdminState =
  | { phase: "idle" }
  | { phase: "pending"; action: string }
  | { phase: "error"; reason: string };

interface FairValue {
  p: number;
  rationale: string;
  engine: string;
}

// One AI estimate per market per page load - reopening a detail view must
// not re-bill the inference provider. Keyed by id AND title: ids are
// per-venue indexes, so a chain/venue switch (or demo -> live) reuses ids
// for entirely different questions.
const fairCache = new Map<string, FairValue>();
const fairKey = (m: Market) => `${m.id}|${m.title}`;

export function MarketDetailModal({
  market,
  activity,
  activityPartial,
  live,
  onTrade,
  onClose,
  onChanged,
}: {
  market: Market;
  activity: ActivityItem[];
  activityPartial: boolean;
  live: boolean;
  onTrade: (market: Market, isYes: boolean) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const venue = contractAddress(chainId);
  const [copied, setCopied] = useState(false);
  const [admin, setAdmin] = useState<AdminState>({ phase: "idle" });
  const [fair, setFair] = useState<FairValue | null>(null);
  const [fairLoading, setFairLoading] = useState(false);

  const { data: owner } = useReadContract({
    abi: outcomeMarketAbi as any,
    address: venue ?? undefined,
    functionName: "owner",
    query: { enabled: live && !!venue },
  });
  const isOwner =
    !!address &&
    typeof owner === "string" &&
    address.toLowerCase() === owner.toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // AI fair value for open markets - the same odds engine the market maker
  // seeds with, surfaced to the trader with its rationale.
  useEffect(() => {
    const key = fairKey(market);
    setFair(fairCache.get(key) ?? null);
    setFairLoading(false);
    if (market.status !== 0 || market.endTime <= Math.floor(Date.now() / 1000))
      return;
    if (fairCache.has(key)) return;

    let cancelled = false;
    setFairLoading(true);
    fetch("/api/ai/odds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: market.title, category: market.category }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (
          !j ||
          j.engine === "offline-fallback" ||
          typeof j.yesProbability !== "number"
        ) {
          if (!cancelled) setFairLoading(false);
          return;
        }
        const fv: FairValue = {
          p: j.yesProbability,
          rationale: String(j.rationale ?? ""),
          engine: String(j.engine ?? ""),
        };
        // Cache even when the modal closed mid-flight - the inference is
        // already paid for; only the state update is skipped.
        fairCache.set(key, fv);
        if (!cancelled) {
          setFairLoading(false);
          setFair(fv);
        }
      })
      .catch(() => {
        if (!cancelled) setFairLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.id, market.title]);

  const total = market.yesPool + market.noPool;
  const yesPct = total === 0n ? 50 : Number((market.yesPool * 100n) / total);
  const tradingEnded = market.endTime <= Math.floor(Date.now() / 1000);
  const closed = market.status !== 0 || tradingEnded;
  const bets = activity.filter(
    (a) => a.kind === "BET" && a.marketId === market.id
  );

  async function share() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}?market=${market.id}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function adminAction(action: "resolveYes" | "resolveNo" | "cancel") {
    if (!venue) return;
    const labels = {
      resolveYes: "RESOLVING YES…",
      resolveNo: "RESOLVING NO…",
      cancel: "CANCELLING…",
    };
    setAdmin({ phase: "pending", action: labels[action] });
    try {
      const hash = await writeContractAsync(
        action === "cancel"
          ? {
              abi: outcomeMarketAbi as any,
              address: venue,
              functionName: "cancelMarket",
              args: [BigInt(market.id)],
              chainId,
            }
          : {
              abi: outcomeMarketAbi as any,
              address: venue,
              functionName: "resolveMarket",
              args: [BigInt(market.id), action === "resolveYes"],
              chainId,
            }
      );
      await publicClient?.waitForTransactionReceipt({ hash });
      setAdmin({ phase: "idle" });
      onChanged();
      onClose();
    } catch (err: any) {
      setAdmin({
        phase: "error",
        reason: err?.shortMessage?.toUpperCase?.() ?? "TX FAILED",
      });
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">
            MARKET #{market.id} · {market.category}
          </span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <h2 className="detail-title">{market.title}</h2>

          <div className="detail-meta">
            <span className={`pos-status ${market.status === 0 ? "open" : market.status === 1 ? "won" : "lost"}`}>
              {market.status === 1
                ? `RESOLVED ${market.outcome ? "YES" : "NO"}`
                : STATUS_LABEL[market.status]}
            </span>
            <span className="market-countdown">
              CLOSES {new Date(market.endTime * 1000).toLocaleString()}
            </span>
            <button className="chip" onClick={share}>
              {copied ? "LINK COPIED ✓" : "SHARE ↗"}
            </button>
          </div>

          <div className="detail-pools">
            <div className="pool-box yes-box">
              <span className="k">YES POOL</span>
              <span className="pool-num yes-pct">{fmtOkb(market.yesPool)} OKB</span>
              <span className="pool-pct">{yesPct}% IMPLIED</span>
            </div>
            <div className="pool-box no-box">
              <span className="k">NO POOL</span>
              <span className="pool-num no-pct">{fmtOkb(market.noPool)} OKB</span>
              <span className="pool-pct">{100 - yesPct}% IMPLIED</span>
            </div>
          </div>

          <div className="odds-bar" style={{ height: 6 }}>
            <div className="yes" style={{ width: `${yesPct}%` }} />
            <div className="no" style={{ width: `${100 - yesPct}%` }} />
          </div>

          {!closed && (fairLoading || fair) && (
            <div className="fair-box">
              <div className="fair-head">
                <span className="label" style={{ fontSize: 9 }}>
                  AI FAIR VALUE
                </span>
                {fair && (
                  <span className="fair-engine">
                    {fair.engine.toUpperCase()}
                  </span>
                )}
              </div>
              {fairLoading ? (
                <p className="fair-loading">ESTIMATING FAIR ODDS…</p>
              ) : (
                fair &&
                (() => {
                  const fairPct = Math.round(fair.p * 100);
                  const delta = fairPct - yesPct;
                  const verdict =
                    Math.abs(delta) < 8
                      ? { text: "IN LINE WITH MARKET", cls: "flat" }
                      : delta > 0
                        ? { text: `SEES VALUE ON YES · +${delta}PTS`, cls: "yes" }
                        : { text: `SEES VALUE ON NO · ${delta}PTS`, cls: "no" };
                  return (
                    <>
                      <div className="fair-row">
                        <span className="fair-num">{fairPct}% YES</span>
                        <span className="fair-vs">MARKET IMPLIES {yesPct}%</span>
                        <span className={`fair-verdict ${verdict.cls}`}>
                          {verdict.text}
                        </span>
                      </div>
                      {fair.rationale && (
                        <p className="fair-rationale">{fair.rationale}</p>
                      )}
                      <span className="fair-disclaimer">
                        MODEL ESTIMATE - NOT FINANCIAL ADVICE
                      </span>
                    </>
                  );
                })()
              )}
            </div>
          )}

          {!closed && (
            <div className="market-actions">
              <button
                className="btn-outcome btn-yes"
                onClick={() => onTrade(market, true)}
              >
                BUY YES
              </button>
              <button
                className="btn-outcome btn-no"
                onClick={() => onTrade(market, false)}
              >
                BUY NO
              </button>
            </div>
          )}

          <div>
            <span className="label" style={{ fontSize: 9 }}>
              RECENT ORDERFLOW
            </span>
            <div className="bet-list">
              {bets.length === 0 ? (
                <p className="empty-note">
                  {activityPartial
                    ? "NO RECENT BETS OBSERVED - PUBLIC RPC LIMITS HISTORY TO RECENT BLOCKS."
                    : "NO BETS RECORDED YET."}
                </p>
              ) : (
                bets.slice(0, 6).map((b) => (
                  <div key={b.id} className="bet-row">
                    {b.text}
                  </div>
                ))
              )}
            </div>
          </div>

          {live && isOwner && market.status === 0 && (
            <div className="admin-box">
              <span className="label" style={{ fontSize: 9 }}>
                RESOLVER CONTROLS
              </span>
              <div className="admin-actions">
                {/* resolveMarket reverts until endTime; cancel is allowed early */}
                <button
                  className="btn-outcome btn-yes"
                  disabled={admin.phase === "pending" || !tradingEnded}
                  onClick={() => adminAction("resolveYes")}
                >
                  RESOLVE YES
                </button>
                <button
                  className="btn-outcome btn-no"
                  disabled={admin.phase === "pending" || !tradingEnded}
                  onClick={() => adminAction("resolveNo")}
                >
                  RESOLVE NO
                </button>
                <button
                  className="chip"
                  disabled={admin.phase === "pending"}
                  onClick={() => adminAction("cancel")}
                >
                  CANCEL &amp; REFUND
                </button>
              </div>
              {!tradingEnded && (
                <span className="leg-status skipped">
                  RESOLVABLE AFTER TRADING CLOSES
                </span>
              )}
              {admin.phase === "pending" && (
                <span className="leg-status pending">{admin.action}</span>
              )}
              {admin.phase === "error" && (
                <span className="leg-status error">{admin.reason}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
